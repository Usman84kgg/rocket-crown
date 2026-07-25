// =====================
// ROCKET CROWN
// =====================


// LOADING SCREEN

setTimeout(() => {

document.getElementById("loading-screen").style.display = "none";
document.getElementById("main-app").style.display = "block";

},2000);


// =====================
// USER DATA
// =====================

let userLevel = 1;


// ОБЩИЙ БАЛАНС В ДОЛЛАРАХ

let totalBalanceUSD = 0.00;


// =====================
// АКТИВЫ ПОЛЬЗОВАТЕЛЯ
// =====================

const walletAssets = {

USDT : 0,
BTC : 0,
ETH : 0,
TON : 0,
TRX : 0,
SOL : 0,
BNB : 0,
DOGE : 0,
XRP : 0,
LTC : 0

};


// =====================
// КУРСЫ КРИПТЫ
// =====================

const cryptoPrices = {

USDT : 1,
BTC : 0,
ETH : 0,
TON : 0,
TRX : 0,
SOL : 0,
BNB : 0,
DOGE : 0,
XRP : 0,
LTC : 0

};


// =====================
// ОБНОВЛЕНИЕ БАЛАНСА
// =====================

function updateBalance() {

const balanceElement = document.querySelector(".balance");

if(balanceElement){

balanceElement.innerHTML = "$" + totalBalanceUSD.toFixed(2);

}

}


// =====================
// ОБНОВЛЕНИЕ VIP LEVEL
// =====================

function updateLevel() {

const levelElement = document.querySelector(".level");

if(levelElement){

levelElement.innerHTML = "LVL " + userLevel;

}

}


// =====================
// ПОЛУЧЕНИЕ КУРСОВ КРИПТЫ
// =====================


// СЮДА ПОЗЖЕ ПОДКЛЮЧИМ API BINANCE
// ИЛИ COINGECKO


function updateCryptoPrices(){

console.log("Crypto API Ready.");

}


// =====================
// ДЕПОЗИТЫ
// =====================

function depositCrypto(){

console.log("Deposit System Ready.");

}


// =====================
// ВЫВОД СРЕДСТВ
// =====================

function withdrawCrypto(){

console.log("Withdraw System Ready.");

}


// =====================
// ИСТОРИЯ ТРАНЗАКЦИЙ
// =====================

function transactionHistory(){

console.log("History Ready.");

}


// =====================
// TELEGRAM WALLET
// =====================

function connectTelegramWallet(){

console.log("Telegram Wallet Ready.");

}


// =====================
// TON CONNECT
// =====================

function connectTONConnect(){

console.log("TON Connect Ready.");

}


// =====================
// VIP SYSTEM
// =====================

function updateVIP(){

console.log("VIP System Ready.");

}


// =====================
// CASHBACK SYSTEM
// =====================

function updateCashback(){

console.log("Cashback System Ready.");

}


// =====================
// PROMO SYSTEM
// =====================

function activatePromoCode(){

console.log("Promo System Ready.");

}


// =====================
// LIVE WINS
// =====================

function updateLiveWins(){

console.log("Live Wins Ready.");

}


// =====================
// JACKPOT SYSTEM
// =====================

function updateJackpot(){

console.log("Jackpot Ready.");

}


// =====================
// START
// =====================

updateBalance();
updateLevel();