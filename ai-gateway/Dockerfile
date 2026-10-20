FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["foms-ai-gateway.csproj", "./"]
RUN dotnet restore "./foms-ai-gateway.csproj"

COPY . .
RUN dotnet build "foms-ai-gateway.csproj" -c Release -o /app/build
RUN dotnet publish "foms-ai-gateway.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "foms-ai-gateway.dll"]
