setTimeout(function () {

document.getElementById("loading-screen").style.display = "none";

document.getElementById("main-app").style.display = "block";

}, 2500);


// Анимация баланса

let balance = 0;

setInterval(() => {

balance += 0.01;

document.querySelector(".balance-card h1").innerHTML =
balance.toFixed(2) + " TON";

}, 3000);