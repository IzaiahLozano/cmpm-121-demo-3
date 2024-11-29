//Imports
import * as leaflet from "leaflet";
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
let geoWatchId: number | null = null;
let autoUpdateEnabled = false;

//Cache store to keep track of generated cache rectangles
let CacheStorage: leaflet.Rectangle[] = [];

// Store for individual movement polylines
let movementPolylines: leaflet.Polyline[] = [];

//Map Setup
const map = leaflet.map(document.getElementById("map")!, {
  center: Kingsburg_StartPoint,
  zoom: zoom,
  minZoom: zoom,
  maxZoom: zoom,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  })
  .addTo(map);

//Player Setup
let playerPosition = Kingsburg_StartPoint;
const playerMarker = leaflet.marker(Kingsburg_StartPoint);
playerMarker.bindTooltip("YOU ARE HERE");
playerMarker.addTo(map);
let playerCoins: Coin[] = []; //Store player coins as objects
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "0 Coins in Inventory";
document.getElementById("geoToggle")!.addEventListener("click", togglelocation);

//Initialize caches
function initializeCaches() {
  for (let i = -SpawnRadius; i <= SpawnRadius; i++) {
    for (let j = -SpawnRadius; j <= SpawnRadius; j++) {
      const cellI = i;
      const cellJ = j;
      if (luck(`${cellI},${cellJ}`) < CacheRate) {
        CacheSpawner(cellI, cellJ);
      }
    }
  }
}

function getCellCoordinates(
  lat: number,
  lng: number
): { i: number; j: number } {
  const i = Math.floor((lat - Kingsburg_StartPoint.lat) / TileDegree);
  const j = Math.floor((lng - Kingsburg_StartPoint.lng) / TileDegree);
  return { i, j };
}

class Coin {
  constructor(public id: string, public value: number) {}
}

const coinCounters = new Map<string, number>();

function buildCachePopup(
  i: number,
  j: number,
  coins: Coin[],
  onCollect: (coin: Coin) => void,
  onDeposit: () => void
): HTMLDivElement {
  const popupDiv = document.createElement("div");
  let coinsHtml = `<div>Cache at "${i}:${j}". Coins available:</div>`;
  coins.forEach((coin) => {
    coinsHtml += `<div>Coin ID: <code>${coin.id}</code> (Value: 1) <button class="collect" data-coin-id="${coin.id}">Collect</button></div>`;
  });
  coinsHtml += `<div><button id="deposit">Deposit All Coins</button></div>`;
  popupDiv.innerHTML = coinsHtml;

  popupDiv.querySelectorAll<HTMLButtonElement>(".collect").forEach((button) => {
    button.addEventListener("click", (e) => {
      const coinId = (e.target as HTMLButtonElement).dataset.coinId;
      const coin = coins.find((c) => c.id === coinId);
      if (coin) {
        onCollect(coin);
        button.disabled = true;
        button.style.backgroundColor = "#ddd";
        button.textContent = "Collected";
      }
    });
  });

  popupDiv
    .querySelector<HTMLButtonElement>("#deposit")!
    .addEventListener("click", () => {
      onDeposit();
    });

  return popupDiv;
}

function CacheSpawner(i: number, j: number) {
  const latStart = Kingsburg_StartPoint.lat + i * TileDegree;
  const lngStart = Kingsburg_StartPoint.lng + j * TileDegree;
  const latEnd = latStart + TileDegree;
  const lngEnd = lngStart + TileDegree;
  const bounds = leaflet.latLngBounds([latStart, lngStart], [latEnd, lngEnd]);

  const cacheKey = `${i},${j}`;
  if (!coinCounters.has(cacheKey)) {
    coinCounters.set(cacheKey, 0);
  }

  const coinSerial = coinCounters.get(cacheKey)!;
  coinCounters.set(cacheKey, coinSerial + 1);

  const coins: Coin[] = [];
  const numberOfCoins = Math.floor(luck(`${i},${j},numCoins`) * 5) + 1;
  for (let c = 0; c < numberOfCoins; c++) {
    const coinId = `${i}:${j}#${coinSerial + c}`;
    const coinValue = 1;
    //Math.floor(luck(`${i},${j},coinValue${coinSerial + c}`) * 10) + 1;
    coins.push(new Coin(coinId, coinValue));
  }

  const rect = leaflet.rectangle(bounds, {
    color: "#3388ff",
    weight: 2,
    fillColor: "#3388ff",
    fillOpacity: 0.3,
  });
  rect.addTo(map);
  CacheStorage.push(rect);

  // Use the extracted UI function
  rect.bindPopup(() =>
    buildCachePopup(
      i,
      j,
      coins,
      (coin) => {
        playerCoins.push(coin);
        coins.splice(coins.indexOf(coin), 1);
        updateStatus();
      },
      () => {
        playerCoins.forEach((coin) => {
          coins.push(new Coin(coin.id, coin.value));
        });
        playerCoins = [];
        updateStatus();
        rect.closePopup();
      }
    )
  );
}

//Update status panel
function updateStatus() {
  const totalCoins = playerCoins.reduce((sum, coin) => sum + coin.value, 0);
  statusPanel.innerHTML = `${totalCoins} Coins in Inventory`;
}

function updatePlayerPosition(position: GeolocationPosition) {
  const { latitude, longitude } = position.coords;

  // Update player position and marker on the map
  playerPosition = leaflet.latLng(latitude, longitude);
  playerMarker.setLatLng(playerPosition);
  map.panTo(playerPosition);

  // Regenerate caches around the new position
  GenerateNearbyCaches();
}

//Generate caches nearby
function GenerateNearbyCaches() {
  const { i: playerI, j: playerJ } = getCellCoordinates(
    playerPosition.lat,
    playerPosition.lng
  );

  for (let di = -SpawnRadius; di <= SpawnRadius; di++) {
    for (let dj = -SpawnRadius; dj <= SpawnRadius; dj++) {
      const cellI = playerI + di;
      const cellJ = playerJ + dj;
      const cellKey = `${cellI},${cellJ}`;

      //Calculate the lat/long off start point
      const lat = Kingsburg_StartPoint.lat + cellI * TileDegree;
      const lng = Kingsburg_StartPoint.lng + cellJ * TileDegree;

      //Only spawn if no existing cache at the location
      if (
        luck(cellKey) < CacheRate &&
        !CacheStorage.some((cache) =>
          cache.getBounds().contains(leaflet.latLng(lat, lng))
        )
      ) {
        CacheSpawner(cellI, cellJ);
      }
    }
  }
}
class CacheMemento {
  constructor(
    public state: Map<string, { bounds: leaflet.LatLngBounds; coins: Coin[] }>
  ) {}
}

class CacheCaretaker {
  private mementos: CacheMemento[] = [];
  save(state: Map<string, { bounds: leaflet.LatLngBounds; coins: Coin[] }>) {
    this.mementos.push(new CacheMemento(new Map(state)));
  }
  restore():
    | Map<string, { bounds: leaflet.LatLngBounds; coins: Coin[] }>
    | undefined {
    const memento = this.mementos.pop();
    return memento ? new Map(memento.state) : undefined;
  }
}

//Instantiate the caretaker and save initial cache state
const cacheCaretaker = new CacheCaretaker();
cacheCaretaker.save(new Map());

//GEO-LOCATION SETTINGS BELOW------------------

function togglelocation() {
  if (autoUpdateEnabled) {
    // Stop the geolocation watch if it's active
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    autoUpdateEnabled = false;
    (moveButtons.reset as HTMLButtonElement).disabled = false; // Re-enable the reset button
  } else {
    // Start the geolocation watch
    geoWatchId = navigator.geolocation.watchPosition(
      updatePlayerPosition // Function to update player position
    );
    autoUpdateEnabled = true;
  }
}

//Player Movement Settings Below -----------------

let movementHistory: leaflet.LatLng[] = []; // Store the player's path

const moveButtons = {
  north: document.getElementById("north"),
  south: document.getElementById("south"),
  west: document.getElementById("west"),
  east: document.getElementById("east"),
  reset: document.getElementById("reset"),
};

if (
  moveButtons.north &&
  moveButtons.south &&
  moveButtons.west &&
  moveButtons.east &&
  moveButtons.reset
) {
  moveButtons.north.addEventListener("click", () => PlayerMoves(1, 0));
  moveButtons.south.addEventListener("click", () => PlayerMoves(-1, 0));
  moveButtons.west.addEventListener("click", () => PlayerMoves(0, -1));
  moveButtons.east.addEventListener("click", () => PlayerMoves(0, 1));
  moveButtons.reset.addEventListener("click", resetGame); //Reset to the starting point
}

//Movement Behavior
function PlayerMoves(deltaI: number, deltaJ: number) {
  const movementDistance = TileDegree;
  const newPlayerPosition = leaflet.latLng(
    playerPosition.lat + deltaI * movementDistance,
    playerPosition.lng + deltaJ * movementDistance
  );

  // Create a polyline segment for the new movement
  const movementSegment = leaflet
    .polyline([playerPosition, newPlayerPosition], {
      color: "blue",
      weight: 2,
      opacity: 0.7,
    })
    .addTo(map);

  // Store this polyline for potential removal later (if needed)
  movementPolylines.push(movementSegment);

  // Update player position and map view
  playerPosition = newPlayerPosition;
  playerMarker.setLatLng(playerPosition);
  map.panTo(playerPosition);

  // Regenerate caches and update movement history (if needed)
  GenerateNearbyCaches();
}

// Reset Settings Below-----------------------------------------------------------

//Reset player position at start + reset game state
function resetGame() {
  const userConfirmation = prompt(
    "Are you sure you want to reset the game? This will erase your progress. Type 'YES' to confirm."
  );

  if (userConfirmation === "YES") {
    resetPlayerPosition();
    resetCaches();
    resetMovementHistory();
    resetPlayerInventory();
    console.log("Game reset complete.");
  } else {
    console.log("Game reset canceled.");
  }
}

function resetPlayerPosition() {
  playerPosition = Kingsburg_StartPoint;
  playerMarker.setLatLng(Kingsburg_StartPoint);
  map.panTo(Kingsburg_StartPoint);
}

function resetCaches() {
  // Clear the map of caches and reset them
  CacheStorage.forEach((rect) => map.removeLayer(rect));
  CacheStorage = [];
  coinCounters.clear();
  initializeCaches(); // Reinitialize caches
}

function resetMovementHistory() {
  movementHistory = [];
  movementPolylines.forEach((polyline) => map.removeLayer(polyline));
  movementPolylines = [];
}

function resetPlayerInventory() {
  playerCoins = [];
  updateStatus();
}

//Save and load player state settings Below------------------------------

// Save player state to localStorage
function saveState() {
  const state = {
    position: playerPosition,
    coins: playerCoins.map((coin) => coin.id), // Save the coin IDs the player has
    movementHistory: movementHistory.map((latLng) => ({
      lat: latLng.lat,
      lng: latLng.lng,
    })),
    movementSegments: movementPolylines.map((polyline) => {
      const latLngs = polyline.getLatLngs() as leaflet.LatLng[];
      return {
        start: { lat: latLngs[0].lat, lng: latLngs[0].lng },
        end: { lat: latLngs[1].lat, lng: latLngs[1].lng },
      };
    }),
    cacheState: CacheStorage.map((cache) => ({
      bounds: cache.getBounds().toBBoxString(), // Saving cache boundaries
      coins: coinCounters.get(cache.getBounds().toBBoxString()), // Get the number of coins in this cache
    })),
  };
  localStorage.setItem("playerState", JSON.stringify(state));
}

// Load player state from localStorage
function loadState() {
  const savedState = localStorage.getItem("playerState");
  if (savedState) {
    const state = JSON.parse(savedState);

    // Restore player position
    playerPosition = leaflet.latLng(state.position.lat, state.position.lng);
    playerMarker.setLatLng(playerPosition);
    map.panTo(playerPosition);

    // Restore player coins
    playerCoins = state.coins.map((id: string) => new Coin(id, 1));
    updateStatus();

    // Restore movement history and draw the path
    movementHistory = state.movementHistory || [];
    (state.movementSegments || []).forEach(
      (segment: { start: any; end: any }) => {
        const polyline = leaflet
          .polyline(
            [
              leaflet.latLng(segment.start.lat, segment.start.lng),
              leaflet.latLng(segment.end.lat, segment.end.lng),
            ],
            { color: "blue", weight: 2, opacity: 0.7 }
          )
          .addTo(map);
        movementPolylines.push(polyline); // Add it back to the array
      }
    );

    // Restore cache state (this will also regenerate caches)
    state.cacheState.forEach((cacheData: { bounds: string; coins: number }) => {
      const bounds = leaflet.latLngBounds(cacheData.bounds);
      CacheSpawner(bounds, cacheData.coins);
    });

    updateStatus();
  }
}

// Call savePlayerState periodically or on globalThis unload
globalThis.addEventListener("beforeunload", saveState);
document.addEventListener("DOMContentLoaded", loadState);

initializeCaches();
