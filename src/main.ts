// Imports
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

//General Settings
const Kingsburg_StartPoint = leaflet.latLng(36.51451, -119.55476);
const zoom = 19;
const TileDegree = 1e-4;
const SpawnRadius = 8;
const CacheRate = 0.1;

//Map Setup
const map = leaflet.map(document.getElementById("map")!, {
  center: Kingsburg_StartPoint,
  zoom: zoom,
  minZoom: zoom,
  maxZoom: zoom,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
})
  .addTo(map);

//Player Setup
const playerMarker = leaflet.marker(Kingsburg_StartPoint);
playerMarker.bindTooltip("YOU ARE HERE");
playerMarker.addTo(map);
let playerCoins = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "0 Coins in Inventory";

function initializeCaches() {
  for (let i = -SpawnRadius; i <= SpawnRadius; i++) {
    for (let j = -SpawnRadius; j <= SpawnRadius; j++) {
      const cacheKey = `${i},${j}`;
      if (luck(cacheKey) < CacheRate) {
        CacheSpawner(i, j);
      }
    }
  }
}

function CacheSpawner(i: number, j: number) {
  const origin = Kingsburg_StartPoint;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TileDegree, origin.lng + j * TileDegree],
    [origin.lat + (i + 1) * TileDegree, origin.lng + (j + 1) * TileDegree],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  //Generate Coins per Cache
  let pointValue = Math.floor(luck(`${i},${j},initialValue`) * 10) + 1;

  //Cache details and collect/deposit buttons
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
        <div>Cache at "${i},${j}". Coins available: <span id="value">${pointValue}</span>.</div>
        <button id="collect">Collect</button>
        <button id="deposit">Deposit</button>`;

    // Collect button Settings
    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        if (pointValue > 0) {
          playerCoins += pointValue;
          pointValue = 0;
          updateStatus();
          updatePopupValue(popupDiv, pointValue);
        }
      },
    );

    // Deposit button Settings
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins > 0) {
          pointValue += playerCoins;
          playerCoins = 0;
          updateStatus();
          updatePopupValue(popupDiv, pointValue);
        }
      },
    );

    return popupDiv;
  });
}

//Update status panel
function updateStatus() {
  statusPanel.innerHTML = `${playerCoins} Coins in Inventory`;
}

//Update popup text
function updatePopupValue(popupDiv: HTMLDivElement, value: number) {
  popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = value
    .toString();
}

initializeCaches();
