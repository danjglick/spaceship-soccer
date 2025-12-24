const MILLISECONDS_PER_FRAME = 10
const PLAYER_RADIUS =  visualViewport.width / 20
const BALL_RADIUS = visualViewport.width / 40
const BALL_COLOR = "white"
const GOAL_WIDTH = visualViewport.width / 10
const GOAL_COLOR = "white"
const GOAL_HEIGHT = visualViewport.height / 100
const PIXEL_SHIM = BALL_RADIUS + PLAYER_RADIUS
const FRAMES_PER_SENT_PLAYER = 3
const SLOW_SPEED = .01
const FAST_SPEED = .05
const FARNESS_THRESHOLD = PLAYER_RADIUS * 5
const FRAMES_BETWEEN_PLAYER_PATH_RESETS = 100
const TACKLE_BLOWBACK_DISTANCE = PLAYER_RADIUS
const RED_TEAM_SHOT_TARGETS = [(visualViewport.width / 2) + (GOAL_WIDTH / 3), (visualViewport.width / 2) - (GOAL_WIDTH / 3)]
const DIRECTIONS = {
  forward: "forward",
  backward: "backward"
}
const GOALS = {
  red: {
    xPos: (visualViewport.width / 2 - GOAL_WIDTH / 2),
    yPos: 0
  },
  blue: {
    xPos: (visualViewport.width / 2  - GOAL_WIDTH / 2),
    yPos: visualViewport.height - GOAL_HEIGHT
  }
}
const WALLS = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom"
}
const PLAYERS_STARTING_POSITIONS = {
  blue: [
    {
      xPos: visualViewport.width / 2,
      yPos: (visualViewport.height / 2) + PIXEL_SHIM,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width / 5,
      yPos: visualViewport.height * 0.75,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width * 0.8,
      yPos: visualViewport.height * 0.75,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width / 2,
      yPos: visualViewport.height - PIXEL_SHIM,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    }
  ],
  red: [
    {
      xPos: visualViewport.width / 2,
      yPos: (visualViewport.height / 2) - (PIXEL_SHIM * 3),
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width / 5,
      yPos: visualViewport.height / 4,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width * 0.8,
      yPos: visualViewport.height / 4,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    },
    {
      xPos: visualViewport.width / 2,
      yPos: PIXEL_SHIM,
      xPosChangePerFrame: 0,
      yPosChangePerFrame: 0
    }
  ]
}
const FRAMES_PER_REPOSSESSION_FREEZE = 30
const TRIES_PER_PATH_CHECK = 100

let canvas;
let context;
let players = JSON.parse(JSON.stringify(PLAYERS_STARTING_POSITIONS))
let ball = {
  radius: BALL_RADIUS,
  xPos: visualViewport.width / 2,
  yPos: visualViewport.height / 2,
  xPosChangePerFrame: 0,
  yPosChangePerFrame: 0
}
let touch1 = {
  xPos: 0,
  yPos: 0
}
let touch2 = {
  xPos: 0,
  yPos: 0
}
let offensiveTeam = players.blue
let defensiveTeam = players.red
let ballPossessor = players.blue[0]
let recentBallPossessor = ballPossessor
let framesLeftRepossessionFreeze = FRAMES_PER_REPOSSESSION_FREEZE
let isSendingBall = false
let isUsingCustomDestination = false
let frameCount = 0
let isPaused = true
let dribblingPlayer = {}
let sentPlayer = {}
let sentPlayerFramesLeft = 0
let score = {
  blue: 0,
  red: 0
}

// inputs

function startGame() {
  canvas = document.getElementById("canvas")
  canvas.width = visualViewport.width
  canvas.height = visualViewport.height
  context = canvas.getContext('2d')
  document.addEventListener("touchstart", handleTouchstart)
  document.addEventListener("touchmove", handleTouchmove, { passive: false })
  document.addEventListener('wheel', function(e){ e.preventDefault() }, { passive: false })
  loopGame()
}

function loopGame() {
  if (!isPaused) {
    frameCount++
    if (frameCount % FRAMES_BETWEEN_PLAYER_PATH_RESETS === 0 || frameCount === 1) setPlayerPaths()
    if (offensiveTeam === players.red && !isSendingBall) setBallPath()
    movePlayers()
    moveBall()
    let collisions = getCollisions()
    for (let i = 0; i < collisions.playerBall.length; i++) { handlePlayerBallCollision(collisions.playerBall[i].player, collisions.playerBall[i].ball) }
    for (let i = 0; i < collisions.objectWall.length; i++) { handleObjectWallCollision(collisions.objectWall[i].object, collisions.objectWall[i].wall) }
    for (let i = 0; i < collisions.ballGoal.length; i++) { handleBallGoalCollision(collisions.ballGoal[i].ball, collisions.ballGoal[i].goal) }
  }
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawGoals()
  drawBall()
  drawPlayers()
  setTimeout(loopGame, MILLISECONDS_PER_FRAME)
}

function handleTouchstart(event) {
  touch1.xPos = event.touches[0].clientX
  touch1.yPos = event.touches[0].clientY
  let isPlayerTouched = false
  for (let i = 0; i < players.blue.length; i++) {
    let bluePlayer = players.blue[i]
    if (isObjectCloseToObject(touch1, PLAYER_RADIUS, bluePlayer)) {
      let isPlayerHorizontallyAlignedWithBall = Math.abs(bluePlayer.xPos - ball.xPos) <= PIXEL_SHIM
      let isPlayerVerticallyAlignedWithBall = Math.abs(bluePlayer.yPos - ball.yPos) <= PIXEL_SHIM
      if (isPlayerHorizontallyAlignedWithBall && isPlayerVerticallyAlignedWithBall) {
        isSendingBall = true
        isPlayerTouched = true
      }
      else {
        sentPlayer = bluePlayer
        isPlayerTouched = true
      }
    }
  }
  if (!isPlayerTouched && offensiveTeam == players.blue) {
    dribblingPlayer = ballPossessor
    setObjectTowardsSpotAtSpeed(ballPossessor, touch1, SLOW_SPEED)
  }
}

function handleTouchmove(event) {
  event.preventDefault()
  touch2.xPos = event.touches[0].clientX
  touch2.yPos = event.touches[0].clientY
  if (isSendingBall) {
    setObjectTowardsSpotAtSpeed(ball, touch2, FAST_SPEED)
    isPaused = false
  } else if (Object.keys(sentPlayer).length > 0) {
    setObjectTowardsSpotAtSpeed(sentPlayer, touch2, FAST_SPEED)
    sentPlayerFramesLeft = FRAMES_PER_SENT_PLAYER
  }
}

// spacehips

function getBestOffensiveSpots() {
  let bestOffensiveSpots = []
  for (let xPos = PIXEL_SHIM; xPos < visualViewport.width; xPos++) {
    for (let yPos = PIXEL_SHIM; yPos < visualViewport.height; yPos++) {
      let spot = {
        xPos: xPos,
        yPos: yPos,
        distance_from_goal: (offensiveTeam === players.blue ? yPos : canvas.height - yPos)
      }
      if (isObjectFarFromObjects(spot, FARNESS_THRESHOLD, defensiveTeam.concat(bestOffensiveSpots))) {
        for (let i = 0; i < offensiveTeam.length - 1; i++) {
          if (
            !bestOffensiveSpots[i] || spot.distanceFromGoal < bestOffensiveSpots[i].distanceFromGoal 
            && isPathClear(offensiveTeam[i], spot)
          ) {
            bestOffensiveSpots[i] = spot
            break
          }
        }
      }
    }
  }
  return bestOffensiveSpots
}

function getBestDefensiveSpots() {
  let bestDefensiveSpots = []
  for (let i = 0; i < defensiveTeam.length - 1; i++) {
    bestDefensiveSpots.push({
      xPos: offensiveTeam[i].xPos,
      yPos: offensiveTeam[i].yPos
    })
  }
  return bestDefensiveSpots
}

function setOffensiveAndDefensiveTeams() {
  for (let i = 0; i < players.blue.length; i++) {
    if (ballPossessor === players.blue[i]) {
      offensiveTeam = players.blue
      defensiveTeam = players.red
      return
    }
  }
  for (let i = 0; i < players.red.length; i++) {
    if (ballPossessor === players.red[i]) {
      offensiveTeam = players.red
      defensiveTeam = players.blue
      return
    }
  }
}

function setPlayerPaths() {
  let bestOffensiveSpots = getBestOffensiveSpots()
  for (let i = 0; i < bestOffensiveSpots.length; i++) {
    if (offensiveTeam[i] !== sentPlayer && offensiveTeam[i] !== dribblingPlayer) setObjectTowardsSpotAtSpeed(offensiveTeam[i], bestOffensiveSpots[i], SLOW_SPEED)
  }
  let bestDefensiveSpots = getBestDefensiveSpots()
  for (let i = 0; i < bestDefensiveSpots.length; i++) {
      if (defensiveTeam[i] !== sentPlayer) setObjectTowardsSpotAtSpeed(defensiveTeam[i], bestDefensiveSpots[i], SLOW_SPEED)
  }
}

function movePlayers() {
  let teams = [players.blue, players.red]
  for (let i = 0; i < teams.length; i++) {
    let team = teams[i]
    if (sentPlayerFramesLeft > 0) {
      sentPlayer.xPos += sentPlayer.xPosChangePerFrame
      sentPlayer.yPos += sentPlayer.yPosChangePerFrame
      sentPlayerFramesLeft--
    }
    let playerClosestToBall = {
      player: {},
      distanceFromBall: 0
    }
    for (let i = 0; i < team.length; i++) {
      let player = team[i]
      if (isSendingBall) {
        let distanceFromBall = Math.abs(ball.xPos - player.xPos) + Math.abs(ball.yPos - player.yPos)
        if (
          Object.keys(playerClosestToBall.player).length === 0 || 
          distanceFromBall < playerClosestToBall.distanceFromBall
        ) {
          playerClosestToBall.player = player
          playerClosestToBall.distanceFromBall = distanceFromBall
        }
      }
      player.xPos += player.xPosChangePerFrame
      player.yPos += player.yPosChangePerFrame
    }
    let isBlueGoalieMakingSave = (
      ballPossessor !== players.blue[players.blue.length - 1] &&
      playerClosestToBall.player === players.blue[players.blue.length - 1] && 
      visualViewport.height - playerClosestToBall.player.yPos < FARNESS_THRESHOLD
    )
    let isRedGoalieMakingSave = (
      ballPossessor !== players.red[players.red.length - 1] &&
      playerClosestToBall.player === players.red[players.red.length - 1] && 
      playerClosestToBall.player.yPos < FARNESS_THRESHOLD
    )
    let speed = (isBlueGoalieMakingSave || isRedGoalieMakingSave) ? FAST_SPEED : SLOW_SPEED
    playerClosestToBall.player.xPosChangePerFrame = (ball.xPos - playerClosestToBall.player.xPos) * speed
    playerClosestToBall.player.yPosChangePerFrame = (ball.yPos - playerClosestToBall.player.yPos) * speed
    playerClosestToBall.player.xPos += playerClosestToBall.player.xPosChangePerFrame
    playerClosestToBall.player.yPos += playerClosestToBall.player.yPosChangePerFrame
  }
}

// ball

function getKickTargetByDirection(direction) {
  if (direction === DIRECTIONS.forward) {
    let shotTarget = {
      xPos: RED_TEAM_SHOT_TARGETS[Math.floor(Math.random() * RED_TEAM_SHOT_TARGETS.length)],
      yPos: visualViewport.height
    }
    if (
      isPathClear(ballPossessor, shotTarget) 
      && ballPossessor.yPos > visualViewport.height / 2
    ) {
      return shotTarget
    }
  }
  let kickTarget = null
  for (let i = 0; i < players.red.length; i++) {
    let redPlayer = players.red[i]
    let isInRightDirection = (
      (direction === "forward" && redPlayer.yPos > ballPossessor.yPos) || 
      (direction === "backward" && redPlayer.yPos < ballPossessor.yPos)
    )
    if (isInRightDirection && isPathClear(ballPossessor, redPlayer)) {
      kickTarget = redPlayer
    }
  }
  return kickTarget
}

function setBallPath() {
  let forwardKickTarget = getKickTargetByDirection(DIRECTIONS.forward)
  let backwardKickTarget = getKickTargetByDirection(DIRECTIONS.backward)
  let isSetToDribbleForward = ballPossessor.yPosChangePerFrame > 0
  if (forwardKickTarget) {
    setObjectTowardsSpotAtSpeed(ball, forwardKickTarget, FAST_SPEED)
    isSendingBall = true
  } else if (isSetToDribbleForward) {
    //do nothing because ballPossessor is already set to dribble forward toward a bestOffensiveSpot
  } else if (backwardKickTarget) {
    setObjectTowardsSpotAtSpeed(ball, backwardKickTarget, FAST_SPEED)
    isSendingBall = true
  } else {
    //do nothing because ballPossessor is already set to dribble backward toward a bestOffensiveSpot
  }
}

function moveBall() {
  if (!isSendingBall) {
    ball.xPosChangePerFrame = ballPossessor.xPosChangePerFrame
    ball.yPosChangePerFrame = ballPossessor.yPosChangePerFrame
  }
  ball.xPos += ball.xPosChangePerFrame
  ball.yPos += ball.yPosChangePerFrame
}

// collisions

function getCollisions() {
  let collisions = {
    playerBall: [],
    objectWall: [],
    ballGoal: []
  }
  let playersList = players.blue.concat(players.red)
  for (let i = 0; i < playersList.length; i++) {
    let player = playersList[i]
    if (player !== recentBallPossessor && isObjectCloseToObject(player, PLAYER_RADIUS, ball)) {
      collisions.playerBall = [{
        player: player,
        ball: ball
      }]
    }
    let wall = getWallCollidedIntoByObject(player)
    if (wall) {
      collisions.objectWall.push({
        object: player,
        wall: wall
      })
    }
    wall = getWallCollidedIntoByObject(ball)
    if (wall) {
      collisions.objectWall.push({
        object: ball,
        wall: wall
      })
    }
    if (ball.xPos >= GOALS.blue.xPos && ball.xPos <= GOALS.blue.xPos + GOAL_WIDTH) {
      if (ball.yPos >= GOALS.blue.yPos) {
        collisions.ballGoal = [{
          ball: ball,
          goal: GOALS.blue
        }]
      } else if (ball.yPos <= GOALS.red.yPos) {
        collisions.ballGoal = [{
          ball: ball,
          goal: GOALS.red
        }]
      }
    }
  }
  if (framesLeftRepossessionFreeze > 0) {
    framesLeftRepossessionFreeze--
  } else {
    recentBallPossessor = {}
  }
  return collisions
}

function handlePlayerBallCollision(player, ball) {
  if (
    isObjectCloseToObject(ballPossessor, PIXEL_SHIM, recentBallPossessor) &&
    ballPossessor !== recentBallPossessor 
  ) {
    if (Math.random() < 0.5) {
      recentBallPossessor.xPos += TACKLE_BLOWBACK_DISTANCE
    } else {
      recentBallPossessor.xPos -= TACKLE_BLOWBACK_DISTANCE
    }
  }
  recentBallPossessor = ballPossessor
  framesLeftRepossessionFreeze = FRAMES_PER_REPOSSESSION_FREEZE
  ballPossessor = player
  isSendingBall = false
  setOffensiveAndDefensiveTeams()
  setPlayerPaths()
}

function handleBallGoalCollision(ball, goal) {
  ball.xPos = visualViewport.width / 2
  ball.yPos = visualViewport.height / 2
  ball.xPosChangePerFrame = 0
  ball.yPosChangePerFrame = 0
  players = PLAYERS_STARTING_POSITIONS
  if (goal === GOALS.blue) {
    score.red++
    isPaused = true
  } else {
    score.blue++
    players.blue[0].yPos = visualViewport.height / 2 + PIXEL_SHIM * 3
    players.red[0].yPos = visualViewport.height / 2 - PIXEL_SHIM
  }
  alert(`Blue ${score.blue} - Red ${score.red}`)
}

function getWallCollidedIntoByObject(object) {
  if (object.xPos < 0) {
    return WALLS.left
  } else if (object.xPos > visualViewport.width) {
    return WALLS.right
  } else if (object.yPos < 0) {
    return WALLS.top
  } else if (object.yPos > visualViewport.height) {
    return WALLS.bottom
  }
}

function handleObjectWallCollision(object, wall) {
  if (wall === WALLS.left) {
    object.xPosChangePerFrame = Math.abs(object.xPosChangePerFrame)
  } else if (wall === WALLS.right) {
    object.xPosChangePerFrame = -Math.abs(object.xPosChangePerFrame)
  } else if (wall === WALLS.top) {
    object.yPosChangePerFrame = Math.abs(object.yPosChangePerFrame)
  } else if (wall === WALLS.bottom) {
    object.yPosChangePerFrame = -Math.abs(object.yPosChangePerFrame)
  }
}

// draw

function drawPlayers() {
  for (let i = 0; i < players.blue.length; i++) {
    let bluePlayer = players.blue[i]
    context.beginPath()
    context.arc(bluePlayer.xPos, bluePlayer.yPos, PLAYER_RADIUS, 0, 2 * Math.PI)
    context.fillStyle = "Cornflowerblue"
    context.fill()
  }
  for (let i = 0; i < players.red.length; i++) {
    let redPlayer = players.red[i]
    context.beginPath()
    context.arc(redPlayer.xPos, redPlayer.yPos, PLAYER_RADIUS, 0, 2 * Math.PI)
    context.fillStyle = "indianRed"
    context.fill()
  }
}

function drawBall() {
  context.beginPath()
  context.arc(ball.xPos, ball.yPos, BALL_RADIUS, 0, 2 * Math.PI)
  context.fillStyle = BALL_COLOR
  context.fill()
}

function drawGoals() {
  context.beginPath()
  context.rect(GOALS.red.xPos, GOALS.red.yPos, GOAL_WIDTH, GOAL_HEIGHT)
  context.fillStyle = GOAL_COLOR
  context.fill()
  context.beginPath()
  context.rect(GOALS.blue.xPos, GOALS.blue.yPos, GOAL_WIDTH, GOAL_HEIGHT)
  context.fillStyle = GOAL_COLOR
  context.fill()
}


// utilities

function isObjectCloseToObject(objectA, distance, objectB) {
  return (
    Math.abs(objectA.xPos - objectB.xPos) < distance && 
    Math.abs(objectA.yPos - objectB.yPos) < distance
  )
}

function isObjectFarFromObjects(object, distance, objects) {
  for (let i = 0; i < objects.length; i++) {
    if (
      Math.abs(object.xPos - objects[i].xPos) < distance && 
      Math.abs(object.yPos - objects[i].yPos) < distance
    ) {
      return false
    }
  }
  return true
}

function isPathClear(startPoint, endPoint) {
  let pathPoint = {
    xPos: startPoint.xPos,
    yPos: startPoint.yPos,
    xPosChangePerFrame: (endPoint.xPos - startPoint.xPos) * SLOW_SPEED,
    yPosChangePerFrame: (endPoint.yPos - startPoint.yPos) * SLOW_SPEED
  }
  let tries = 0
  while (tries < TRIES_PER_PATH_CHECK) {
    tries++
    pathPoint.xPos += pathPoint.xPosChangePerFrame
    pathPoint.yPos += pathPoint.yPosChangePerFrame
    for (let i = 0; i < defensiveTeam.length; i++) {
      let defensivePlayer = defensiveTeam[i]
      if (isObjectCloseToObject(pathPoint, PIXEL_SHIM, defensivePlayer)) {
        return false
      }
    }
    if (isObjectCloseToObject(pathPoint, PIXEL_SHIM, endPoint)) {
      return true
    }
  }
  return true
}

function setObjectTowardsSpotAtSpeed(object, spot, speed) {
  object.xPosChangePerFrame = (spot.xPos - object.xPos) * speed
  object.yPosChangePerFrame = (spot.yPos - object.yPos) * speed
}