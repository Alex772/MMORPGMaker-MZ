const express       = require("express")
  , bodyParser    = require('body-parser')
  , path          = require('path')
  , fs            = require('fs')
  , app           = express()
  , server        = require('http').createServer(app)
  , io            = require('socket.io').listen(server, { log: false })

/*****************************
      STARTING THE SERVER
*****************************/

// Express settings
app.use('/app/bower_components', express.static(path.join(process.cwd(), 'bower_components')))
app.use(express.static(__dirname + '/app'));
app.use(bodyParser.json({limit: '2mb'}));       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({extended: true,limit: '2mb'}));   // to support URL-encoded bodies
app.use(function(req,res,next){ // CORS (read : https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS)
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    next();
});

server.listen(8097);

console.log("######################################");
console.log("# MMORPG Maker MV - Samuel Lespes Cardillo");
console.log("# Check GitHub for updates");
console.log("######################################");
console.log("[I] Socket.IO server started on port 8097 ...");

// PARAMETERS 
const registrationOnTheFly = true;
const newPlayerDetails = { 
  mapId: 1,
  skin: 1,
  x: 5,
  y: 5
}
const offlineMap = {
  'map-3': true
};
// PARAMETERS

// CORE INTEGRATIONS
MMO_Core = {
  "database": require('./core/database')
}

MMO_Core["database"].initialize(); // Initializing the database

io.on("connect",function(client){
  client.on("login",function(data){
    MMO_Core["database"].findUser(data["username"], function(output){
      if(output[0] == undefined) {
        if(!registrationOnTheFly) return false;
        MMO_Core["database"].registerUser(data["username"], newPlayerDetails, function(output){
          MMO_Core["database"].findUser(data["username"], function(output){
            loginPlayer(client,output[0]);
          });
        });
        return;
      }

      loginPlayer(client,output[0]);
    })
  });

  client.on("map_joined",function(playerData){
    if(client.lastMap != undefined) {
      if(offlineMap[client.lastMap] == undefined) {
        client.broadcast.to(client.lastMap).emit('map_exited',client.id);
      }
      client.leave(client.lastMap);
      console.log(client.id + " left " + client.lastMap);
    }

    playerData.username = client.playerData.username; // Temporary way to pass the username
    playerData.skin     = client.playerData.skin;

    client.join("map-" + playerData["mapId"]);
    client.lastMap = "map-" + playerData["mapId"];
    
    if(offlineMap[client.lastMap] == undefined) {
      client.broadcast.to("map-" + playerData["mapId"]).emit("map_joined",{id:client.id,playerData:playerData});
      client.broadcast.to("map-" + playerData["mapId"]).emit("refresh_players_position",client.id);
    }
  
    console.log(client.id + " joined map-" + client.lastMap);
  })

  client.on("refresh_players_position",function(data){
    if(offlineMap[client.lastMap] != undefined) return false;

    console.log(client.id + " transmit position to " + data.id);

    data["playerData"].username = client.playerData.username; // Temporary way to pass the username
    data["playerData"].skin     = client.playerData.skin;

    client.broadcast.to(data["id"]).emit("map_joined",{id:client.id,playerData:data["playerData"]});
  })

  client.on("player_start_moving",function(keyCode){
    if(offlineMap[client.lastMap] != undefined) return false;

    client.broadcast.to(client.lastMap).emit("player_start_moving",{id:client.id,keyCode:keyCode});
  })

  client.on("player_stop_moving",function(data){
    if(offlineMap[client.lastMap] != undefined) return false;
    client.playerData["x"] = data["x"];
    client.playerData["y"] = data["y"];
    client.playerData["mapId"] = data["mapId"];
    client.broadcast.to(client.lastMap).emit("player_stop_moving",{id:client.id,playerData:data});
  })

  client.on("new_message",function(message){
    io.in(client.lastMap).emit("new_message",{username:client.playerData["username"],msg:message});
  })

  client.on("disconnect",function(){
    if(client.lastMap == undefined) return;

    MMO_Core["database"].savePlayer(client.playerData,function(output){
      client.broadcast.to(client.lastMap).emit('map_exited',client.id);
      client.leave(client.lastMap);
    });
  })
})

// Connecting the player and storing datas locally
function loginPlayer(client, details) { 
  console.dir(details);
  client.emit("login",{msg: details})
  client.playerData = details;
  console.log(client.id + " connected to the game");
}