//Imports
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

//Cache store to keep track of generated cache rectangles
let CacheStorage: leaflet.Rectangle[] = [];

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
let playerPosition = Kingsburg_StartPoint;
const playerMarker = leaflet.marker(Kingsburg_StartPoint);
playerMarker.bindTooltip("YOU ARE HERE");
playerMarker.addTo(map);
let playerCoins: Coin[] = []; //Store player coins as objects
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "0 Coins in Inventory";

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
  lng: number,
): { i: number; j: number } {
  const i = Math.floor((lat - Kingsburg_StartPoint.lat) / TileDegree);
  const j = Math.floor((lng - Kingsburg_StartPoint.lng) / TileDegree);
  return { i, j };
}

class Coin {
  constructor(public id: string, public value: number) {}
}

const coinCounters = new Map<string, number>();

function CacheSpawner(i: number, j: number) {
  const latStart = Kingsburg_StartPoint.lat + i * TileDegree;
  const lngStart = Kingsburg_StartPoint.lng + j * TileDegree;
  const latEnd = latStart + TileDegree;
  const lngEnd = lngStart + TileDegree;
  const bounds = leaflet.latLngBounds(
    [latStart, lngStart],
    [latEnd, lngEnd],
  );

  const cacheKey = `${i},${j}`;

  if (!coinCounters.has(cacheKey)) {
    coinCounters.set(cacheKey, 0);
  }

  const coinSerial = coinCounters.get(cacheKey)!; //Must be defined now
  coinCounters.set(cacheKey, coinSerial + 1);

  const coins: Coin[] = [];

  //Generate Coins for this cache
  const numberOfCoins = Math.floor(luck(`${i},${j},numCoins`) * 5) + 1; //Number of coins per cache

  //Create coins for this cache
  for (let c = 0; c < numberOfCoins; c++) {
    const coinId = `${i}:${j}#${coinSerial + c}`;
    const coinValue =
      Math.floor(luck(`${i},${j},coinValue${coinSerial + c}`) * 10) + 1;
    coins.push(new Coin(coinId, coinValue));
  }

  const rect = leaflet.rectangle(bounds, {
    color: "#3388ff", //Outline color
    weight: 2, //Outline thickness
    fillColor: "#3388ff", //Inner color
    fillOpacity: 0.3, //Transparency of fill
  });
  rect.addTo(map);
  rect.bringToFront();

  CacheStorage.push(rect);

  //Cache details and deposit button
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    let coinsHtml = `<div>Cache at "${i}:${j}". Coins available:</div>`;
    coins.forEach((coin) => {
      coinsHtml +=
        `<div>Coin ID: <code>${coin.id}</code> (Value: ${coin.value}) <button class="collect" data-coin-id="${coin.id}">Collect</button></div>`;
    });
    coinsHtml += `<div><button id="deposit">Deposit All Coins</button></div>`;
    popupDiv.innerHTML = coinsHtml;

    popupDiv.querySelectorAll<HTMLButtonElement>(".collect").forEach(
      (button) => {
        button.addEventListener("click", (e) => {
          const coinId = (e.target as HTMLButtonElement).dataset.coinId;
          const coin = coins.find((c) => c.id === coinId);
          if (coin) {
            playerCoins.push(coin);
            coins.splice(coins.indexOf(coin), 1);
            updateStatus();
            updatePopupValue(popupDiv);
            button.disabled = true;
            button.style.backgroundColor = "#ddd";
            button.textContent = "Collected";
          }
        });
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        playerCoins.forEach((coin) => {
          coins.push(new Coin(coin.id, coin.value));
        });
        playerCoins = [];
        updateStatus();
        updatePopupValue(popupDiv);
        rect.closePopup();
      },
    );

    return popupDiv;
  });
}

//Update status panel
function updateStatus() {
  const totalCoins = playerCoins.reduce((sum, coin) => sum + coin.value, 0);
  statusPanel.innerHTML = `${totalCoins} Coins in Inventory`;
}

//Update popup text
function updatePopupValue(popupDiv: HTMLDivElement) {
  const totalCoins = playerCoins.reduce((sum, coin) => sum + coin.value, 0);
  popupDiv.querySelectorAll("span#value").forEach((span) => {
    span.innerHTML = `${totalCoins}`;
  });
}

//Generate caches nearby
function GenerateNearbyCaches() {
  const { i: playerI, j: playerJ } = getCellCoordinates(
    playerPosition.lat,
    playerPosition.lng,
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
    public state: Map<string, { bounds: leaflet.LatLngBounds; coins: Coin[] }>,
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

//Player Movement Settings Beyond this point -----------------
const moveButtons = {
  north: document.getElementById("north"),
  south: document.getElementById("south"),
  west: document.getElementById("west"),
  east: document.getElementById("east"),
  reset: document.getElementById("reset"),
};

if (
  moveButtons.north && moveButtons.south && moveButtons.west &&
  moveButtons.east && moveButtons.reset
) {
  moveButtons.north.addEventListener("click", () => PlayerMoves(1, 0));
  moveButtons.south.addEventListener("click", () => PlayerMoves(-1, 0));
  moveButtons.west.addEventListener("click", () => PlayerMoves(0, -1));
  moveButtons.east.addEventListener("click", () => PlayerMoves(0, 1));
  moveButtons.reset.addEventListener("click", resetPlayer); //Reset to the starting point
}

//Movement Behavior
function PlayerMoves(deltaI: number, deltaJ: number) {
  const movementDistance = TileDegree;
  playerPosition = leaflet.latLng(
    playerPosition.lat + deltaI * movementDistance,
    playerPosition.lng + deltaJ * movementDistance,
  );
  playerMarker.setLatLng(playerPosition);
  map.panTo(playerPosition);

  //Generate caches around player's new position
  GenerateNearbyCaches();
}

//Reset player position at start
function resetPlayer() {
  //Reset player position
  playerPosition = Kingsburg_StartPoint;
  playerMarker.setLatLng(Kingsburg_StartPoint);
  map.panTo(Kingsburg_StartPoint);

  //Remove existing cache rectangles from the map and clear CacheStorage
  CacheStorage.forEach((rect) => map.removeLayer(rect));
  CacheStorage = []; //Clear the array

  //Reinitialize caches after clearing
  initializeCaches();
}

initializeCaches();
