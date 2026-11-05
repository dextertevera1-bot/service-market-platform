// Builds public/simulator.html with the live engine inlined: node build.js
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/public/simulator.src.html", "utf8");
const engine = fs.readFileSync(__dirname + "/src/engine.js", "utf8");
fs.writeFileSync(__dirname + "/public/simulator.html", src.replace("/*ENGINE*/", () => engine));
console.log("built public/simulator.html");
