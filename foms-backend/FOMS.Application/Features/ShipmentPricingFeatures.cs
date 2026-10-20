using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class ShipmentPricingFeatures
{
    public record GetRatesQuery : IRequest<List<ShipmentRate>>;

    public class GetRatesQueryHandler : IRequestHandler<GetRatesQuery, List<ShipmentRate>>
    {
        private readonly IApplicationDbContext _context;

        public GetRatesQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<ShipmentRate>> Handle(GetRatesQuery request, CancellationToken cancellationToken)
        {
            return await _context.ShipmentRates.ToListAsync(cancellationToken);
        }
    }

    public record ComputePriceCommand(
        string Origin,
        string Destination,
        decimal Weight,
        decimal Volume,
        string CargoType
    ) : IRequest<PricingResult>;

    public record PricingResult(
        decimal BaseFare,
        decimal WeightCharge,
        decimal VolumeCharge,
        decimal ExtraCharge,
        decimal TotalCharges,
        int EstimatedDays
    );

    public class ComputePriceCommandHandler : IRequestHandler<ComputePriceCommand, PricingResult>
    {
        private readonly IApplicationDbContext _context;

        public ComputePriceCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<PricingResult> Handle(ComputePriceCommand request, CancellationToken cancellationToken)
        {
            var rate = await _context.ShipmentRates.FirstOrDefaultAsync(r => 
                r.Origin.ToLower() == request.Origin.ToLower() && 
                r.Destination.ToLower() == request.Destination.ToLower(), 
                cancellationToken);

            decimal baseFare = rate?.BaseFare ?? 150m;
            decimal ratePerKg = rate?.RatePerKg ?? 15m;
            decimal ratePerCbm = rate?.RatePerCbm ?? 250m;
            int estDays = rate?.EstimatedDays ?? 3;

            decimal weightCharge = request.Weight * ratePerKg;
            decimal volumeCharge = request.Volume * ratePerCbm;

            decimal extraCharge = 0m;
            if (request.CargoType.ToLower() == "fragile" || request.CargoType.ToLower() == "sensitive")
            {
                extraCharge = 100m;
            }
            else if (request.CargoType.ToLower() == "express")
            {
                extraCharge = 250m;
                estDays = Math.Max(1, estDays - 1);
            }

            decimal total = baseFare + weightCharge + volumeCharge + extraCharge;

            return new PricingResult(baseFare, weightCharge, volumeCharge, extraCharge, total, estDays);
        }
    }
}
