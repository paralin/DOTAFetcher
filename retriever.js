var config = require('./config');
var Steam = require("steam");
var Dota2 = require("dota2");
var utility = require("./utility");
var async = require('async');
var convert64To32 = utility.convert64to32;
var express = require('express');
var Chance = require('chance');
var app = express();
var users = config.STEAM_USER.split(",");
var passes = config.STEAM_PASS.split(",");
var steamObj = {};
var accountToIdx = {};
var replayRequests = 0;
var launch = new Date();
var a = [];
var port = config.PORT || config.RETRIEVER_PORT;
//create array of numbers from 0 to n
var count = 0;
if (config.STEAM_USER !== "")
  while (a.length < users.length) a.push(a.length + 0);

app.use(function(req, res, next) {
    if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
        //reject request if doesnt have key
        return next("invalid key");
    } else{
        next(null);
    }
});
app.get('/', function(req, res, next) {
    var keys = Object.keys(steamObj);

    if (keys.length == 0) return next("No accounts ready");

    var r = keys[Math.floor((Math.random() * keys.length))];
    if (req.query.mmstats) {
        getMMStats(r, function(err, data) {
            res.locals.data = data;
            return next(err);
        });
    }
    else if (req.query.match_id) {
        getGCMatchDetails(r, req.query.match_id, function(err, data) {
            res.locals.data = data;
            return next(err);
        });
    }
    else if (req.query.account_id) {
        var idx = accountToIdx[req.query.account_id] || r;
        getPlayerProfile(idx, req.query.account_id, function(err, data) {
            res.locals.data = data;
            return next(err);
        });
    }
    else {
        res.locals.data = genStats(req.query.list_friends != null);
        return next();
    }
});
app.use(function(req, res) {
    res.json(res.locals.data);
});
app.use(function(err, req, res, next) {
    return res.status(500).json({
        error: err
    });
});

var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});

async.each(a, function(i, cb) {

    var dotaReady = false;
    var relationshipReady = false;
    var client = new Steam.SteamClient();
    client.steamUser = new Steam.SteamUser(client);
    client.steamFriends = new Steam.SteamFriends(client);
    client.Dota2 = new Dota2.Dota2Client(client, false, false);
    var user = users[i];
    var pass = passes[i];
    var logOnDetails = {
        "account_name": user,
        "password": pass
    };
    client.connect();
    client.on('connected', function() {
        console.log("[STEAM] Trying to log on with %s,%s", user, pass);
        client.steamUser.logOn(logOnDetails);
        client.once('error', function onSteamError(e) {
            //reset
            console.log(e);
            console.log("reconnecting");
            client.connect();
        });
    });
    client.on("logOnResponse", function(logonResp) {
        if (logonResp.eresult !== Steam.EResult.OK) {
            //try logging on again
            return client.steamUser.logOn(logOnDetails);
        }
        console.log("[STEAM] Logged on %s", client.steamID);
        var chance = new Chance(utility.hashCode(""+client.steamID));
        client.steamFriends.setPersonaName("[BOT] " + chance.name());
        client.replays = 0;
        client.profiles = 0;
        client.Dota2.once("ready", function() {
            //console.log("Dota 2 ready");
            steamObj[client.steamID] = client;
            dotaReady = true;
            allDone();
        });
        client.Dota2.launch();
        client.steamFriends.on("relationships", function() {
            //console.log(Steam.EFriendRelationship);
            console.log("searching for pending friend requests...");
            //friends is a object with key steam id and value relationship
            //console.log(Steam.friends);
            for (var prop in client.steamFriends.friends) {
                //iterate through friends and accept requests/populate hash
                var steamID = prop;
                var relationship = client.steamFriends.friends[prop];
                //friends that came in while offline
                if (relationship === Steam.EFriendRelationship.RequestRecipient) {
                    client.steamFriends.addFriend(steamID);
                    console.log(steamID + " was added as a friend");
                }
                accountToIdx[convert64To32(steamID)] = client.steamID;
            }
            console.log("finished searching");
        });
        client.steamFriends.once("relationships", function() {
            //console.log("relationships obtained");
            relationshipReady = true;
            allDone();
        });
        client.steamFriends.on("friend", function(steamID, relationship) {
            //immediately accept incoming friend requests
            if (relationship === Steam.EFriendRelationship.RequestRecipient) {
                console.log("friend request received");
                client.steamFriends.addFriend(steamID);
                var existing = accountToIdx[convert64To32(steamID)];
                if (existing) {
                  console.log("friend request accepted, and friendship on different account removed");
                  var steam = steamObj[existing];
                  steam.steamFriends.removeFriend(steamID);
                } else
                  console.log("friend request accepted");
                accountToIdx[convert64To32(steamID)] = client.steamID;
            }
            if (relationship === Steam.EFriendRelationship.None) {
                delete accountToIdx[convert64To32(steamID)];
            }
        });
        client.once('loggedOff', function() {
            console.log("relogging");
            client.steamUser.logOn(logOnDetails);
        });
    });

    function allDone() {
        if (dotaReady && relationshipReady) {
            count += 1;
            console.log("acct %s ready, %s/%s", i, count, users.length);
            cb();
        }
    }
});

function genStats(listFriends) {
    var stats = {};
    var numReadyAccounts = Object.keys(steamObj).length

    for (var key in steamObj) {
        stats[key] = {
            steamID: key,
            replays: steamObj[key].replays,
            profiles: steamObj[key].profiles,
            friends: Object.keys(steamObj[key].steamFriends.friends).length
        };
        if (listFriends)
          stats[key].friends_list = steamObj[key].steamFriends.friends;
    }
    var data = {
        replayRequests: replayRequests,
        uptime: (new Date() - launch) / 1000,
        numReadyAccounts: numReadyAccounts,
        ready: numReadyAccounts === users.length,
        accounts: stats,
        accountToIdx: accountToIdx
    };
    return data;
}

function getMMStats(idx, cb) {
    steamObj[idx].Dota2.matchmakingStatsRequest();
    steamObj[idx].Dota2.once('matchmakingStatsData', function(waitTimes, searchingPlayers, disabledGroups, raw){
        cb(null, raw.searching_players_by_group_source2);
    });
}

function getPlayerProfile(idx, account_id, cb) {
    account_id = Number(account_id);
    var Dota2 = steamObj[idx].Dota2;
    console.log("requesting player profile %s", account_id);
    steamObj[idx].profiles += 1;
    Dota2.profileRequest(account_id, false, function(err, profileData) {
        //console.log(err, profileData);
        cb(err, profileData.game_account_client);
    });
}

function getGCMatchDetails(idx, match_id, cb) {
    match_id = Number(match_id);
    var Dota2 = steamObj[idx].Dota2;
    console.log("[DOTA] requesting details %s, numusers: %s, requests: %s", match_id, users.length, replayRequests);
    replayRequests += 1;
    if (replayRequests >= 500) {
        selfDestruct();
    }
    steamObj[idx].replays += 1;
    Dota2.matchDetailsRequest(match_id, function(err, matchData) {
        cb(err, matchData);
    });
}

function selfDestruct() {
    process.exit(0);
}
