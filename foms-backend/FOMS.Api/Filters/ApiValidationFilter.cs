using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using FluentValidation;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using ValidationException = FOMS.Application.Exceptions.ValidationException;

namespace FOMS.Api.Filters;

public class ApiValidationFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // 1. Protect against empty payloads (if a body parameter is expected but not provided)
        if (context.ActionArguments.Count == 0 && context.ActionDescriptor.Parameters.Any(p => p.BindingInfo?.BindingSource?.Id == "Body"))
        {
            throw new ValidationException(new Dictionary<string, string[]> {
                { "Payload", new[] { "Request payload cannot be empty." } }
            });
        }

        // 2. Protect against null objects / invalid JSON for body parameters
        var bodyParams = context.ActionDescriptor.Parameters
            .Where(p => p.BindingInfo?.BindingSource?.Id == "Body")
            .Select(p => p.Name)
            .ToHashSet();

        if (bodyParams.Count > 0 && context.ActionArguments.Any(kv => bodyParams.Contains(kv.Key) && kv.Value == null))
        {
            throw new ValidationException(new Dictionary<string, string[]> {
                { "Payload", new[] { "Request payload is invalid or null." } }
            });
        }

        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument == null) continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            var validator = context.HttpContext.RequestServices.GetService(validatorType) as IValidator;

            if (validator != null)
            {
                var validationContext = new ValidationContext<object>(argument);
                var result = await validator.ValidateAsync(validationContext);

                if (!result.IsValid)
                {
                    var errors = result.Errors
                        .GroupBy(e => e.PropertyName)
                        .ToDictionary(
                            g => g.Key,
                            g => g.Select(e => e.ErrorMessage).ToArray()
                        );

                    throw new ValidationException(errors);
                }
            }
        }

        await next();
    }
}
