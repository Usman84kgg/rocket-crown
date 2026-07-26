// =========================
// ROCKET CASINO
// =========================


// ПОИСК ИГР

const searchInput = document.querySelector("input");

if (searchInput) {

searchInput.addEventListener("input", function () {

const value = this.value.toLowerCase();

const games = document.querySelectorAll(".game-card");

games.forEach(game => {

if (game.innerText.toLowerCase().includes(value)) {

game.style.display = "block";

} else {

game.style.display = "none";

}

});

});

}


// =========================
// ОТКРЫТИЕ ИГР
// =========================

const gameCards = document.querySelectorAll(".game-card");

gameCards.forEach(game => {

game.addEventListener("click", () => {

alert(
game.innerText +
"\n\nComing Soon!"
);

});

});


// =========================
// ROCKET TOURNAMENT
// =========================

console.log("Rocket Tournament Ready.");


// =========================
// LUCKY DROP
// =========================

console.log("Lucky Drop Ready.");


// =========================
// LEADERBOARD
// =========================

console.log("Leaderboard Ready.");


// =========================
// LIVE CASINO
// =========================

console.log("Live Casino Ready.");


// =========================
// SLOTS
// =========================

console.log("Slots Ready.");


// =========================
// ROCKET ORIGINALS
// =========================

console.log("Rocket Originals Ready.");


// =========================
// SEARCH SYSTEM
// =========================

console.log("Search System Ready.");


// =========================
// TELEGRAM MINI APP READY
// =========================

console.log("Rocket Casino Loaded Successfully.");