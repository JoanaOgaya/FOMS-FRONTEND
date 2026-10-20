# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY FOMS.sln ./
COPY FOMS.Domain/FOMS.Domain.csproj FOMS.Domain/
COPY FOMS.Application/FOMS.Application.csproj FOMS.Application/
COPY FOMS.Infrastructure/FOMS.Infrastructure.csproj FOMS.Infrastructure/
COPY FOMS.Api/FOMS.Api.csproj FOMS.Api/
COPY FOMS.Tests/FOMS.Tests.csproj FOMS.Tests/

RUN dotnet restore

# Copy all code and build
COPY . .
RUN dotnet publish FOMS.Api/FOMS.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "FOMS.Api.dll"]
