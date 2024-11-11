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
let playerCoins: Coin[] = []; //Store player coins as objects
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "0 Coins in Inventory";

//Initialize caches
function initializeCaches() {
  for (let i = -SpawnRadius; i <= SpawnRadius; i++) {
    for (let j = -SpawnRadius; j <= SpawnRadius; j++) {
      const { i: cellI, j: cellJ } = getCellCoordinates(
        Kingsburg_StartPoint.lat + i * TileDegree,
        Kingsburg_StartPoint.lng + j * TileDegree,
      );

      if (luck(`${cellI},${cellJ}`) < CacheRate) {
        CacheSpawner(i, j);
      }
    }
  }
}

function getCellCoordinates(
  lat: number,
  lng: number,
): { i: number; j: number } {
  const i = Math.floor(lat / TileDegree);
  const j = Math.floor(lng / TileDegree);
  return { i, j };
}

class Coin {
  constructor(public id: string, public value: number) {}
}

const coinCounters = new Map<string, number>();

function CacheSpawner(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [
      Kingsburg_StartPoint.lat + i * TileDegree,
      Kingsburg_StartPoint.lng + j * TileDegree,
    ],
    [
      Kingsburg_StartPoint.lat + (i + 1) * TileDegree,
      Kingsburg_StartPoint.lng + (j + 1) * TileDegree,
    ],
  ]);

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

  //Cache details and deposit button
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");

    let coinsHtml = `<div>Cache at "${i}:${j}". Coins available:</div>`;
    coins.forEach((coin) => {
      coinsHtml += `
        <div>
          Coin ID: <code>${coin.id}</code> (Value: ${coin.value})
          <button class="collect" data-coin-id="${coin.id}">Collect</button>
        </div>`;
    });

    coinsHtml += `<div><button id="deposit">Deposit All Coins</button></div>`;

    popupDiv.innerHTML = coinsHtml;

    //Collect buttons logic
    popupDiv.querySelectorAll<HTMLButtonElement>(".collect").forEach(
      (button) => {
        button.addEventListener("click", (e) => {
          const coinId = (e.target as HTMLButtonElement).dataset.coinId;
          if (coinId) {
            const coin = coins.find((c) => c.id === coinId);
            if (coin) {
              playerCoins.push(coin); //Add coin to player's inventory
              console.log(`Collected Coin: ${coin.id}`);
              coins.splice(coins.indexOf(coin), 1); //Remove collected coin
              updateStatus();
              updatePopupValue(popupDiv);

              //Change the button style to indicate it's been collected
              const collectButton = e.target as HTMLButtonElement;
              collectButton.disabled = true; //Disable the button
              collectButton.style.backgroundColor = "#ddd"; //Darken the color
              collectButton.textContent = "Collected";
            }
          }
        });
      },
    );

    //Deposit button logic
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins.length > 0) {
          playerCoins.forEach((coin) => {
            const newCoinId = coin.id;
            const newCoinValue = coin.value; //Modifiable deposit value
            coins.push(new Coin(newCoinId, newCoinValue)); //Add to the cache's coins array
          });

          playerCoins = []; //Clear the player's inventory after deposit
          updateStatus();
          updatePopupValue(popupDiv);

          //Close the popup after deposit
          rect.closePopup();
        }
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

initializeCaches();
