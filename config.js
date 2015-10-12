try {
    require('dotenv').load();
}
catch(e){
    console.log("[WARNING] error occurred when loading .env: %s", e);
}
var defaults = {
    "STEAM_USER": "",
    "STEAM_PASS": "",
    "NODE_ENV": "development",
    "MONGO_URL": "mongodb://localhost/dota",
    "STEAM_API_HOST": "api.steampowered.com",
    "ROLE": "retriever", //for specifying a node type
    "PROFILE_CONFIG": ""
};
//ensure that process.env has all values in defaults, but prefer the process.env value
for (var key in defaults) {
    process.env[key] = process.env[key] || defaults[key];
}
if (process.env.NODE_ENV === "development") {
    //force PORT to null in development so we can run multiple web services without conflict
    process.env.PORT = "";
}
//now processes can use either process.env or config
module.exports = process.env;
