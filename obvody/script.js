// Limits of how many things we can have
var MAX_DEVICES = 1024;
var MAX_WIRES = MAX_DEVICES * 2;
var GRID_SIZE = 1024;
var UNDO_DEPTH = 1024;
var MAX_GRID_DOTS = 2048;

// Device kinds are represented by integers
var DEVICE_KIND_NONE = -1;
var DEVICE_KIND_SWITCH = 0;
var DEVICE_KIND_LIGHT = 1;
var DEVICE_KIND_EXTENSION = 2;
var DEVICE_KIND_NOT_GATE = 3;
var DEVICE_KIND_OR_GATE = 4;
var DEVICE_KIND_AND_GATE = 5;
var DEVICE_KIND_BUTTON = 6;

// Constants different for each device kind
var DEVICE_INPUT_COUNT = [0, 1, 1, 1, 2, 2, 0];
var DEVICE_OUTPUT_COUNT = [1, 0, 1, 1, 1, 1, 1];

// Visual constants
var GRID_CELL_SIZE = 36;
var GRID_DOT_RADIUS = 2;
var DEVICE_BORDER_WIDTH = 2;
var NODE_RADIUS = 5;
var NODE_BORDER_WIDTH = 2;
var WIRE_OUTER_WIDTH = 7;
var WIRE_INNER_WIDTH = 3;
var WIRE_NODE_INNER_RADIUS = 5;
var WIRE_NODE_OUTER_RADIUS = 7;
var MIN_VIEW_SCALE = 0.35;
var MAX_VIEW_SCALE = 3.5;
var ZOOM_STEP = 1.15;
var COLOR_OFF = "black";
var COLOR_ON = "lightyellow";
var SWITCH_TOGGLE_WIDTH = 34;
var SWITCH_TOGGLE_HEIGHT = 20; // also used for light

var GATE_LABELS = [null, null, null, "nie", "alebo", "a", null];

var canvasWidth = 600;
var canvasHeight = 600;

var GAME_STORAGE_KEY = "gameData";
var currentExerciseName = null;
var manifest = null;

// Used for initialization
function fillArray(array, value) {
	for (var i = 0; i < array.length; ++i) array[i] = value;
}

function makeFilledArray(length, value) {
	var array = Array(length);
	fillArray(array, value);
	return array;
}

function createDefaultGameState() {
	return {
		devicePositions: makeFilledArray(MAX_DEVICES, -1),
		deviceKinds: makeFilledArray(MAX_DEVICES, DEVICE_KIND_NONE),
		nodeValues: makeFilledArray(3 * MAX_DEVICES, false),
		wires: makeFilledArray(2 * MAX_WIRES, -1),
		wireStack: makeFilledArray(MAX_WIRES, -1),
		wireCount: 0,
		viewOffsetX: 0,
		viewOffsetY: 0,
		viewScale: 1,
		builtinCount: 0,
		builtinLabels: makeFilledArray(MAX_DEVICES, ""),
		zadanie: ""
	};
}

function countUsedWiresFromStack(stack) {
	var count = 0;
	for (var i = 0; i < stack.length; ++i) {
		if (stack[i] === -1) break;
		++count;
	}
	return count;
}

function applySparseEntries(targetArray, sparseEntries) {
	if (!sparseEntries || typeof sparseEntries !== "object") return;
	for (var key in sparseEntries) {
		if (!Object.prototype.hasOwnProperty.call(sparseEntries, key)) continue;
		var index = Math.floor(Number(key));
		if (!Number.isFinite(index)) continue;
		if (index < 0 || index >= targetArray.length) continue;
		targetArray[index] = sparseEntries[key];
	}
}

function normalizeArrayFromRaw(rawValue, sparseRawValue, targetLength, defaultValue) {
	var result;
	if (Array.isArray(rawValue)) {
		result = rawValue.slice(0, targetLength);
	} else {
		result = makeFilledArray(targetLength, defaultValue);
		applySparseEntries(result, sparseRawValue);
	}
	while (result.length < targetLength) result.push(defaultValue);
	return result;
}

function normalizeLoadedGameState(rawGameState) {
	var defaults = createDefaultGameState();
	if (!rawGameState || typeof rawGameState !== "object") return defaults;

	defaults.devicePositions = normalizeArrayFromRaw(
		rawGameState.devicePositions,
		rawGameState.devicePositionsSparse,
		MAX_DEVICES,
		-1
	);

	defaults.deviceKinds = normalizeArrayFromRaw(
		rawGameState.deviceKinds,
		rawGameState.deviceKindsSparse,
		MAX_DEVICES,
		DEVICE_KIND_NONE
	);

	defaults.nodeValues = normalizeArrayFromRaw(
		rawGameState.nodeValues,
		rawGameState.nodeValuesSparse,
		3 * MAX_DEVICES,
		false
	);

	defaults.wires = normalizeArrayFromRaw(
		rawGameState.wires,
		rawGameState.wiresSparse,
		2 * MAX_WIRES,
		-1
	);

	defaults.wireStack = normalizeArrayFromRaw(
		rawGameState.wireStack,
		rawGameState.wireStackSparse,
		MAX_WIRES,
		-1
	);

	defaults.wireCount = typeof rawGameState.wireCount === "number"
		? clamp(0, Math.floor(rawGameState.wireCount), MAX_WIRES)
		: countUsedWiresFromStack(defaults.wireStack);
	defaults.viewOffsetX = typeof rawGameState.viewOffsetX === "number" ? rawGameState.viewOffsetX : defaults.viewOffsetX;
	defaults.viewOffsetY = typeof rawGameState.viewOffsetY === "number" ? rawGameState.viewOffsetY : defaults.viewOffsetY;
	defaults.viewScale = typeof rawGameState.viewScale === "number" ? rawGameState.viewScale : defaults.viewScale;
	defaults.builtinCount = typeof rawGameState.builtinCount === "number"
		? clamp(0, Math.floor(rawGameState.builtinCount), MAX_DEVICES)
		: defaults.builtinCount;
	defaults.builtinLabels = normalizeArrayFromRaw(
		rawGameState.builtinLabels,
		rawGameState.builtinLabelsSparse,
		MAX_DEVICES,
		""
	);
	defaults.zadanie = typeof rawGameState.zadanie === "string" ? rawGameState.zadanie : defaults.zadanie;

	return defaults;
}

var gameState = createDefaultGameState();

function saveGameStateToStorage() {
	var key = currentExerciseName ? GAME_STORAGE_KEY + "_" + currentExerciseName : GAME_STORAGE_KEY;
	localStorage.setItem(key, JSON.stringify(gameState));
}

// Arrays of things

// Description of arrays in undo history
var ARRAYS_ALL = [];
var ARRAY_DEVICE_POSITIONS = 0;
var ARRAY_DEVICE_KINDS = 1;
var ARRAY_WIRES = 2;

// Undo history
var undoWhichArray = Array(UNDO_DEPTH); fillArray(undoWhichArray, -1);
var undoValueBefore = Array(UNDO_DEPTH); fillArray(undoValueBefore, -1);
var undoValueAfter = Array(UNDO_DEPTH); fillArray(undoValueAfter, -1);
var undoBatchStart = Array(UNDO_DEPTH); fillArray(undoBatchStart, -1);

// Positions within arrays
var undoStackTop = -1;
var undoCurrentDepth = 0;

// Interface with the page
var canvas = document.getElementById("canvas");
var drawingContext = canvas.getContext("2d");
var buttonAddWire = document.getElementById("add-wire");
var buttonDelete = document.getElementById("delete-selected");
var selectAddDevice = document.getElementById("add-device");
var buttonStartEditing = document.getElementById("start-editing");
var buttonFinishEditing = document.getElementById("finish-editing");
var toolbarView = document.getElementById("toolbar-view");
var toolbarEditing = document.getElementById("toolbar-editing");
var saveButton = document.getElementById("save");
var reloadLevelButton = document.getElementById("reload-level");
var exerciseContent = document.getElementById("exerciseContent");
var zoomInButton = document.getElementById("zoom-in");
var zoomOutButton = document.getElementById("zoom-out");
var zoomResetButton = document.getElementById("zoom-reset");
var simulationTimerHandle = null;

function updateExerciseContent() {
	if (!exerciseContent) return;
	if (!gameState.zadanie) {
		exerciseContent.textContent = "Vyber zadanie";
		return;
	}

	if (typeof marked !== "undefined" && typeof marked.parse === "function") {
		exerciseContent.innerHTML = marked.parse(gameState.zadanie);
	} else {
		exerciseContent.textContent = gameState.zadanie;
	}
}

// Current selection and action
var editing = true;
var selectedWire = -1;
var selectedDevice = -1;
var draggedWireEnd = -1;
var draggedWireTargetNode = -1;
var draggedDevice = -1;
var draggedDeviceTargetPosition = -1;

// Adding state
var addingDevice = -1;
var addingWire = false;

// When dragging, the original view state before the drag
var draggingView = false;
var viewAnchorX = 0;
var viewAnchorY = 0;
var viewAnchorScale = 1;

// General for any kind of dragging
var dragCurrentX = 0;
var dragCurrentY = 0;
var dragOriginX = 0;
var dragOriginY = 0;
var dragPointerId = -2;

// Current view

var simulationTimeout = 30;

var pendingRedraw = false;

function simulateStep() {
	for (var i = 0; i < MAX_DEVICES; ++i) {
		switch (gameState.deviceKinds[i]) {
			case DEVICE_KIND_EXTENSION:
				gameState.nodeValues[3 * i + 2] = gameState.nodeValues[3 * i];
				break;
			case DEVICE_KIND_NOT_GATE:
				gameState.nodeValues[3 * i + 2] = !gameState.nodeValues[3 * i];
				break;
			case DEVICE_KIND_OR_GATE:
				gameState.nodeValues[3 * i + 2] = gameState.nodeValues[3 * i] || gameState.nodeValues[3 * i + 1];
				break;
			case DEVICE_KIND_AND_GATE:
				gameState.nodeValues[3 * i + 2] = gameState.nodeValues[3 * i] && gameState.nodeValues[3 * i + 1];
				break;
			case DEVICE_KIND_BUTTON:
				gameState.nodeValues[3 * i + 2] = gameState.nodeValues[3 * i];
				gameState.nodeValues[3 * i] = false;
				break;
		}
	}
	for (var i = 0; i < MAX_WIRES; ++i) {
		if (gameState.wires[2 * i] === -1 || gameState.wires[2 * i + 1] === -1) continue;
		gameState.nodeValues[gameState.wires[2 * i + 1]] = gameState.nodeValues[gameState.wires[2 * i]];
	}
}

// Tests a circuit that's supposed to be a pure function of its inputs
function test(inputCount, timeLimit, testingFunction) {
	for (var input = 0; input < 1 << inputCount; ++input) {
		fillArray(gameState.nodeValues, false);
		for (var i = 0; i < inputCount; ++i) {
			gameState.nodeValues[3 * i + 2] = (input & (1 << i)) > 0;
		}
		for (var i = 0; i < timeLimit; ++i) simulateStep();
		output = 0;
		for (var i = 0; i < gameState.builtinCount - inputCount; ++i) {
			output |= (gameState.nodeValues[3 * (inputCount + i)] ? 1 : 0) << i;
		}
		if (output !== testingFunction(input)) {
			console.log("input", input, "expected", testingFunction(input), "got", output);
			return false;
		}
	}
	return true;
}

// Begins a new path with the specified rounded rectangle
function drawRoundedRect(x, y, width, height, radius) {
	drawingContext.beginPath();
	drawingContext.moveTo(x + radius, y);
	drawingContext.arcTo(x + width, y, x + width, y + radius, radius);
	drawingContext.arcTo(x + width, y + height, x + width - radius, y + height, radius);
	drawingContext.arcTo(x, y + height, x, y + height - radius, radius);
	drawingContext.arcTo(x, y, x + radius, y, radius);
}

function drawCircle(x, y, radius) {
	drawRoundedRect(x - radius, y - radius, 2 * radius, 2 * radius, radius);
}

function drawWirePath(x0, y0, x1, y1) {
	drawingContext.beginPath();
	drawingContext.moveTo(x0, y0);
	drawingContext.bezierCurveTo(0.625 * x0 + 0.375 * x1, y0, 0.375 * x0 + 0.625 * x1, y1, x1, y1);
	drawingContext.stroke();
}

function gridToScreenX(gridPosition) {
	return (gridPosition % GRID_SIZE) * GRID_CELL_SIZE;
}

function gridToScreenY(gridPosition) {
	return Math.floor(gridPosition / GRID_SIZE) * GRID_CELL_SIZE;
}

function clamp(lower, value, upper) {
	if (value < lower) return lower;
	if (value > upper) return upper;
	return value;
}

function screenToGridPosition(screenX, screenY) {
	var gridX = clamp(0, Math.floor((screenX + gameState.viewOffsetX) / gameState.viewScale / GRID_CELL_SIZE + 0.5), GRID_SIZE - 1);
	var gridY = clamp(0, Math.floor((screenY + gameState.viewOffsetY) / gameState.viewScale / GRID_CELL_SIZE + 0.5), GRID_SIZE - 1);
	return GRID_SIZE * gridY + gridX;
}

function gridPositionFromMiddle(dx, dy) {
	var half = GRID_SIZE / 2;
	return GRID_SIZE * (half + dy) + half + dx;
}

function screenToGridPositionUntransformed(screenX, screenY) {
	var gridX = clamp(0, Math.floor(screenX / GRID_CELL_SIZE + 0.5), GRID_SIZE - 1);
	var gridY = clamp(0, Math.floor(screenY / GRID_CELL_SIZE + 0.5), GRID_SIZE - 1);
	return GRID_SIZE * gridY + gridX;
}

function doesNodeExist(node) {
	var deviceKind = gameState.deviceKinds[Math.floor(node / 3)];
	if (deviceKind === DEVICE_KIND_NONE) return false;
	var nodeOffset = node % 3;
	if (
		nodeOffset >= DEVICE_INPUT_COUNT[deviceKind] && nodeOffset < 2 ||
		nodeOffset - 2 >= DEVICE_OUTPUT_COUNT[deviceKind] && nodeOffset >= 2
	) return false;
	return true;
}

function getNodePosition(node) {
	var device = Math.floor(node / 3);
	if (node % 3 === 2) {
		var kind = gameState.deviceKinds[device];
		return gameState.devicePositions[device] + GRID_SIZE * DEVICE_INPUT_COUNT[kind] + 1;
	}
	return gameState.devicePositions[device] + GRID_SIZE * (node % 3);
}

function drawDevice(index, dx, dy, isSelected) {
	var kind = gameState.deviceKinds[index];
	var width = 2;
	var height = DEVICE_INPUT_COUNT[kind] + DEVICE_OUTPUT_COUNT[kind];

	var position = gameState.devicePositions[index];
	var screenX = gridToScreenX(position) + dx;
	var screenY = gridToScreenY(position) + dy;

	drawingContext.fillStyle = "lightgray";
	drawingContext.strokeStyle = isSelected ? "white" : "darkgray";
	drawingContext.lineWidth = DEVICE_BORDER_WIDTH;
	drawRoundedRect(
		screenX - GRID_CELL_SIZE / 2,
		screenY - GRID_CELL_SIZE / 2,
		width * GRID_CELL_SIZE, height * GRID_CELL_SIZE,
		GRID_CELL_SIZE / 2
	);
	drawingContext.fill();
	drawingContext.stroke();

	// For builtin devices, draw their labels
	if (index < gameState.builtinCount) {
		drawingContext.textAlign = "center";
		drawingContext.textBaseline = "bottom";
		drawingContext.font = "14px system-ui";
		drawingContext.fillStyle = "white";
		drawingContext.fillText(
			gameState.builtinLabels[index], screenX + GRID_CELL_SIZE / 2,
			screenY - GRID_CELL_SIZE / 2 - 5
		);
	}

	switch (kind) {
		case DEVICE_KIND_SWITCH:
			drawingContext.fillStyle = gameState.nodeValues[3 * index + 2] ? COLOR_ON : COLOR_OFF;
			drawingContext.strokeStyle = "gray";
			drawRoundedRect(
				screenX - SWITCH_TOGGLE_HEIGHT / 2, screenY - SWITCH_TOGGLE_HEIGHT / 2,
				SWITCH_TOGGLE_WIDTH, SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT / 2
			);
			drawingContext.fill();
			drawingContext.stroke();
			drawingContext.fillStyle = "white";
			drawRoundedRect(
				screenX - SWITCH_TOGGLE_HEIGHT / 2 + (SWITCH_TOGGLE_WIDTH - SWITCH_TOGGLE_HEIGHT) * gameState.nodeValues[3 * index + 2],
				screenY - SWITCH_TOGGLE_HEIGHT / 2,
				SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT / 2
			);
			drawingContext.fill();
			drawingContext.stroke();
			break;
		case DEVICE_KIND_BUTTON:
			drawingContext.fillStyle = "darkgray";
			drawingContext.strokeStyle = "gray";
			drawRoundedRect(
				screenX - SWITCH_TOGGLE_HEIGHT / 2, screenY - SWITCH_TOGGLE_HEIGHT / 2,
				SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT / 2
			);
			drawingContext.fill();
			drawingContext.stroke();
			break;
		case DEVICE_KIND_LIGHT:
			drawingContext.fillStyle = gameState.nodeValues[3 * index] ? COLOR_ON : COLOR_OFF;
			drawingContext.strokeStyle = "gray";
			drawRoundedRect(
				screenX - SWITCH_TOGGLE_HEIGHT / 2 + GRID_CELL_SIZE, screenY - SWITCH_TOGGLE_HEIGHT / 2,
				SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT, SWITCH_TOGGLE_HEIGHT / 2
			);
			drawingContext.fill();
			drawingContext.stroke();
			break;
		case DEVICE_KIND_NOT_GATE: case DEVICE_KIND_OR_GATE: case DEVICE_KIND_AND_GATE:
			drawingContext.textAlign = "left";
			drawingContext.textBaseline = "alphabetic";
			drawingContext.font = "14px system-ui";
			drawingContext.fillStyle = "black";
			drawingContext.fillText(GATE_LABELS[kind], screenX - 10, screenY + (height - 1) * GRID_CELL_SIZE + 7);
			break;
	}

	// Nodes
	drawingContext.strokeStyle = "gray";
	drawingContext.lineWidth = NODE_BORDER_WIDTH;
	for (var j = 0; j < DEVICE_INPUT_COUNT[kind]; ++j) {
		drawCircle(screenX, screenY + j * GRID_CELL_SIZE, NODE_RADIUS);
		drawingContext.fillStyle = gameState.nodeValues[3 * index + j] ? COLOR_ON : COLOR_OFF;
		drawingContext.fill();
		drawingContext.stroke();
	}
	for (var j = 0; j < DEVICE_OUTPUT_COUNT[kind]; ++j) {
		drawCircle(
			screenX + (width - 1) * GRID_CELL_SIZE,
			screenY + (height - j - 1) * GRID_CELL_SIZE, NODE_RADIUS
		);
		drawingContext.fillStyle = gameState.nodeValues[3 * index + 2 + j] ? COLOR_ON : COLOR_OFF;
		drawingContext.fill();
		drawingContext.stroke();
	}
}

function drawWirePart(x0, y0, x1, y1, color, width, radius) {
	drawingContext.strokeStyle = color;
	drawingContext.fillStyle = color;
	drawingContext.lineWidth = width;
	drawWirePath(x0, y0, x1, y1);
	drawingContext.stroke();
	drawCircle(x0, y0, radius);
	drawingContext.fill();
	drawCircle(x1, y1, radius);
	drawingContext.fill();
}

function drawWire(index, dx0, dy0, dx1, dy1, isSelected) {
	var startNode = gameState.wires[2 * index];
	var endNode = gameState.wires[2 * index + 1];

	var startPosition = getNodePosition(startNode);
	var endPosition = getNodePosition(endNode);

	var x0 = gridToScreenX(startPosition) + dx0;
	var y0 = gridToScreenY(startPosition) + dy0;
	var x1 = gridToScreenX(endPosition) + dx1;
	var y1 = gridToScreenY(endPosition) + dy1;

	drawWirePart(
		x0, y0, x1, y1, "red", WIRE_OUTER_WIDTH + 3 * isSelected,
		WIRE_NODE_OUTER_RADIUS + isSelected
	);
	drawWirePart(
		x0, y0, x1, y1, gameState.nodeValues[startNode] ? COLOR_ON : COLOR_OFF,
		WIRE_INNER_WIDTH, WIRE_NODE_INNER_RADIUS
	)
}

// Redraw the entire view
function draw() {
	pendingRedraw = false;

	// Clear the screen
	drawingContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
	drawingContext.clearRect(0, 0, canvasWidth, canvasHeight);

	// Draw the grid
	var scaledCellSize = GRID_CELL_SIZE * gameState.viewScale;
	var gridDotCount = canvasWidth / scaledCellSize * canvasHeight / scaledCellSize;
	if (gridDotCount <= MAX_GRID_DOTS) {
		drawingContext.fillStyle = "lightgray";
		for (var gridDotY = (-gameState.viewOffsetY % scaledCellSize) - scaledCellSize; gridDotY < canvasHeight + scaledCellSize; gridDotY += scaledCellSize) {
			for (var gridDotX = (-gameState.viewOffsetX % scaledCellSize) - scaledCellSize; gridDotX < canvasWidth + scaledCellSize; gridDotX += scaledCellSize) {
				drawCircle(gridDotX, gridDotY, GRID_DOT_RADIUS * gameState.viewScale);
				drawingContext.fill();
			}
		}
	}

	drawingContext.setTransform(
		gameState.viewScale * devicePixelRatio, 0, 0, gameState.viewScale * devicePixelRatio,
		-gameState.viewOffsetX * devicePixelRatio, -gameState.viewOffsetY * devicePixelRatio
	);

	// Draw devices
	for (var i = 0; i < MAX_DEVICES; ++i) {
		if (i === draggedDevice) continue;
		if (gameState.deviceKinds[i] == DEVICE_KIND_NONE) continue;
		drawDevice(i, 0, 0, selectedDevice === i);
	}

	// If dragging a device, draw its shadow at its target position
	if (draggedDevice !== -1) {
		var draggedKind = gameState.deviceKinds[draggedDevice];
		var draggedWidth = 2;
		var draggedHeight = DEVICE_INPUT_COUNT[draggedKind] + DEVICE_OUTPUT_COUNT[draggedKind];

		var screenX = gridToScreenX(draggedDeviceTargetPosition);
		var screenY = gridToScreenY(draggedDeviceTargetPosition);

		drawingContext.fillStyle = "#0002";
		drawRoundedRect(
			screenX - GRID_CELL_SIZE / 2,
			screenY - GRID_CELL_SIZE / 2,
			draggedWidth * GRID_CELL_SIZE, draggedHeight * GRID_CELL_SIZE,
			GRID_CELL_SIZE / 2
		);
		drawingContext.fill();
	}

	// Draw wires
	for (var i = 0; i < gameState.wireCount; ++i) {
		var wire = gameState.wireStack[i];
		if (wire === Math.floor(draggedWireEnd / 2)) continue;

		var wireStartDevice = Math.floor(gameState.wires[2 * wire] / 3);
		var wireEndDevice = Math.floor(gameState.wires[2 * wire + 1] / 3);

		if (wireStartDevice === draggedDevice || wireEndDevice === draggedDevice) continue;
		drawWire(wire, 0, 0, 0, 0, selectedWire === wire);
	}

	// Draw the dragged device
	if (draggedDevice !== -1) {
		drawDevice(draggedDevice, (dragCurrentX - dragOriginX) / gameState.viewScale, (dragCurrentY - dragOriginY) / gameState.viewScale, true);

		// Draw gameState.wires connected to it
		for (var i = 0; i < gameState.wireCount; ++i) {
			var wire = gameState.wireStack[i];

			var dx0 = 0, dy0 = 0, dx1 = 0, dy1 = 0;
			var wireStartDevice = Math.floor(gameState.wires[2 * wire] / 3);
			var wireEndDevice = Math.floor(gameState.wires[2 * wire + 1] / 3);
			if (wireStartDevice !== draggedDevice && wireEndDevice !== draggedDevice) continue;
			if (wireStartDevice === draggedDevice) {
				dx0 = (dragCurrentX - dragOriginX) / gameState.viewScale;
				dy0 = (dragCurrentY - dragOriginY) / gameState.viewScale;
			}
			if (wireEndDevice === draggedDevice) {
				dx1 = (dragCurrentX - dragOriginX) / gameState.viewScale;
				dy1 = (dragCurrentY - dragOriginY) / gameState.viewScale;
			}

			drawWire(wire, dx0, dy0, dx1, dy1, 0);
		}
	}

	// Draw the dragged wire
	if (draggedWireEnd !== -1) {
		var draggedWire = Math.floor(draggedWireEnd / 2);
		var isWireEnd = draggedWireEnd % 2; // 0 if start, 1 if end
		var dx = dragCurrentX - dragOriginX;
		var dy = dragCurrentY - dragOriginY;
		drawWire(
			draggedWire,
			(1 - isWireEnd) * dx / gameState.viewScale, (1 - isWireEnd) * dy / gameState.viewScale,
			isWireEnd * dx / gameState.viewScale, isWireEnd * dy / gameState.viewScale, true
		);
	}
}

function requestRedraw() {
	if (pendingRedraw) return;
	pendingRedraw = true;
	//DEBUG_MEASURE_TIME("drawing", function() {
	requestAnimationFrame(draw);
	//});
}

function updateCanvasSize() {
	var canvasClientRect = canvas.getBoundingClientRect();
	canvasWidth = canvasClientRect.width;
	canvasHeight = canvasClientRect.height;
	canvas.setAttribute("width", canvasWidth * devicePixelRatio);
	canvas.setAttribute("height", canvasHeight * devicePixelRatio);
}

function DEBUG_MEASURE_TIME(description, callback) {
	var start = Date.now();
	callback();
	var duration = Date.now() - start;
	console.log(description, "took", duration, "ms");
}

// TODO: make it so that view is anchored to the center of the canvas
function resetView() {
	gameState.viewScale = 1;
	gameState.viewOffsetX = (GRID_CELL_SIZE * GRID_SIZE - canvasWidth) / 2;
	gameState.viewOffsetY = (GRID_CELL_SIZE * GRID_SIZE - canvasHeight) / 2;
}

function zoomAroundScreenPoint(screenX, screenY, scaleFactor) {
	var oldScale = gameState.viewScale;
	var newScale = clamp(MIN_VIEW_SCALE, oldScale * scaleFactor, MAX_VIEW_SCALE);
	if (newScale === oldScale) return;

	var worldX = (screenX + gameState.viewOffsetX) / oldScale;
	var worldY = (screenY + gameState.viewOffsetY) / oldScale;

	gameState.viewScale = newScale;
	gameState.viewOffsetX = worldX * newScale - screenX;
	gameState.viewOffsetY = worldY * newScale - screenY;
	requestRedraw();
}

function zoomAroundCanvasCenter(scaleFactor) {
	zoomAroundScreenPoint(canvasWidth / 2, canvasHeight / 2, scaleFactor);
}

window.addEventListener("resize", function () {
	updateCanvasSize();
	requestRedraw();
});

window.addEventListener("load", function () {
})

canvas.addEventListener("wheel", function (event) {
	event.preventDefault();
	var factor = Math.exp(-event.deltaY * 0.0015);
	zoomAroundScreenPoint(event.offsetX, event.offsetY, factor);
}, { passive: false });

// If pointer events are supported, we use only those
if (PointerEvent) {
	canvas.addEventListener("pointerdown", function (event) {
		var selectedPosition = screenToGridPosition(event.offsetX, event.offsetY);
		if (dragPointerId !== -2) return;
		dragPointerId = event.pointerId;
		canvas.setPointerCapture(event.pointerId);
		if (addingDevice !== -1) {
			// Find a free slot in the array to put it
			for (var i = 0; i < MAX_DEVICES; ++i) {
				if (gameState.deviceKinds[i] === DEVICE_KIND_NONE) {
					// TODO: find a place that doesn't intersect
					gameState.deviceKinds[i] = addingDevice;
					gameState.devicePositions[i] = selectedPosition;
					// addingDevice = -1;
					// selectAddDevice.value = "-1";
					requestRedraw();
					return;
				}
			}
			// TODO: unable to add new device
			return;
		}

		if (addingWire) {
			// Find a free slot in the array to put it
			if (gameState.wireCount === MAX_WIRES) {
				addingWire = false;
				buttonAddWire.disabled = false;
				return;
			}; // TODO: error message
			// Find the node at the selected position
			for (var i = 0; i < 3 * MAX_DEVICES; ++i) {
				if (!doesNodeExist(i)) continue;
				if (getNodePosition(i) !== selectedPosition) continue;
				// If it's an input, check if there already isn't a wire connected
				if (i % 3 < 2) {
					for (var j = 0; j < MAX_WIRES; ++j) {
						if (gameState.wires[j] === i) {
							// addingWire = false;
							buttonAddWire.disabled = false;
							return;
						}
					}
				}
				var isOutputNode = i % 3 < 2 ? 0 : 1;
				// Find a place in the array to put it
				for (var j = 0; j < MAX_WIRES; ++j) {
					if (gameState.wires[2 * j] === -1) {
						gameState.wires[2 * j] = i;
						gameState.wires[2 * j + 1] = i;
						gameState.wireStack[gameState.wireCount] = j;
						gameState.wireCount = gameState.wireCount + 1;
						draggedWireEnd = 2 * j + isOutputNode;
						dragOriginX = event.offsetX;
						dragOriginY = event.offsetY;
						dragCurrentX = dragOriginX;
						dragCurrentY = dragOriginY;
						selectedWire = j;
						buttonDelete.disabled = false;
						// addingWire = false;
						buttonAddWire.disabled = false;
						requestRedraw();
						return;
					}
				}
			}
			// There is no node at that position
			buttonAddWire.disabled = false;
			addingWire = false;
			return;
		}

		if (draggedDevice !== -1 || draggedWireEnd !== -1) return;
		if (draggingView) return; // TODO: handle a second pointer for zooming
		dragOriginX = event.offsetX;
		dragOriginY = event.offsetY;
		dragCurrentX = dragOriginX;
		dragCurrentY = dragOriginY;

		// If not editing, we check if we're tapping a light switch or a button
		if (!editing) {
			for (var i = 0; i < MAX_DEVICES; ++i) {
				if (gameState.devicePositions[i] !== selectedPosition) continue;
				if (gameState.deviceKinds[i] === DEVICE_KIND_SWITCH) {
					gameState.nodeValues[3 * i + 2] = !gameState.nodeValues[3 * i + 2];
				}
				if (gameState.deviceKinds[i] === DEVICE_KIND_BUTTON) {
					gameState.nodeValues[3 * i] = true;
				}
			}
		}

		// If editing, we figure out what we are grabbing:

		if (editing) {

			// First we try wire
			// We go down the stack, so we first catch the topmost wire
			for (var i = gameState.wireCount - 1; i >= 0; --i) {
				var wire = gameState.wireStack[i];
				for (var j = 0; j < 2; ++j) {
					var wireNode = gameState.wires[2 * wire + j];
					if (getNodePosition(wireNode) === selectedPosition) {
						draggedWireEnd = 2 * wire + j;
						selectedWire = wire;
						selectedDevice = -1;
						buttonDelete.disabled = false;
						// now we put it on top of the stack
						for (var k = i + 1; k < gameState.wireCount; ++k) {
							gameState.wireStack[k - 1] = gameState.wireStack[k];
						}
						gameState.wireStack[gameState.wireCount - 1] = wire;
						requestRedraw();
						return;
					}
				}
			}

			// If no wire found, then we try device
			for (var i = 0; i < MAX_DEVICES; ++i) {
				var deviceKind = gameState.deviceKinds[i];
				if (deviceKind === -1) continue;

				var selectedX = selectedPosition % GRID_SIZE;
				var selectedY = Math.floor(selectedPosition / GRID_SIZE);
				var deviceX = gameState.devicePositions[i] % GRID_SIZE;
				var deviceY = Math.floor(gameState.devicePositions[i] / GRID_SIZE);
				var deviceHeight = DEVICE_INPUT_COUNT[deviceKind] + DEVICE_OUTPUT_COUNT[deviceKind];

				if (
					deviceX <= selectedX && selectedX <= deviceX + 1 &&
					deviceY <= selectedY && selectedY < deviceY + deviceHeight
				) {
					draggedDevice = i;
					draggedDeviceTargetPosition = gameState.devicePositions[draggedDevice];
					selectedDevice = i;
					selectedWire = -1;
					buttonDelete.disabled = selectedDevice < gameState.builtinCount;
					requestRedraw();
					return;
				}
			}

		}

		// Otherwise, we are dragging the view
		selectedDevice = -1;
		selectedWire = -1;
		buttonDelete.disabled = true;

		draggingView = true;
		viewAnchorX = gameState.viewOffsetX;
		viewAnchorY = gameState.viewOffsetY;
		viewAnchorScale = gameState.viewScale;
		requestRedraw();
	});

	canvas.addEventListener("pointermove", function (event) {
		if (event.pointerId !== dragPointerId) return;
		if (draggedDevice === -1 && draggedWireEnd === -1 && !draggingView) return;
		dragCurrentX = event.offsetX;
		dragCurrentY = event.offsetY;
		if (draggedDevice !== -1) {
			var originalDevicePosition = gameState.devicePositions[draggedDevice];
			var selectedPosition = screenToGridPositionUntransformed(
				gridToScreenX(originalDevicePosition) + (event.offsetX - dragOriginX) / gameState.viewScale,
				gridToScreenY(originalDevicePosition) + (event.offsetY - dragOriginY) / gameState.viewScale
			);
			// see if the device intersects anything
			var deviceKind = gameState.deviceKinds[draggedDevice];
			var deviceWidth = 2;
			var deviceHeight = DEVICE_INPUT_COUNT[deviceKind] + DEVICE_OUTPUT_COUNT[deviceKind];
			var deviceX = selectedPosition % GRID_SIZE;
			var deviceY = Math.floor(selectedPosition / GRID_SIZE);
			var isIntersecting = false;
			for (var i = 0; i < MAX_DEVICES; ++i) {
				if (i === draggedDevice) continue;
				var otherKind = gameState.deviceKinds[i];
				if (otherKind === DEVICE_KIND_NONE) continue;
				var otherWidth = 2;
				var otherHeight = DEVICE_INPUT_COUNT[otherKind] + DEVICE_OUTPUT_COUNT[otherKind];
				var otherX = gameState.devicePositions[i] % GRID_SIZE;
				var otherY = Math.floor(gameState.devicePositions[i] / GRID_SIZE);

				if (
					otherX < deviceX + deviceWidth && otherY < deviceY + deviceHeight &&
					deviceX < otherX + otherWidth && deviceY < otherY + otherHeight
				) {
					isIntersecting = true;
					break;
				}
			}
			if (!isIntersecting) draggedDeviceTargetPosition = selectedPosition;
		}
		if (draggingView) {
			gameState.viewOffsetX = viewAnchorX - dragCurrentX + dragOriginX;
			gameState.viewOffsetY = viewAnchorY - dragCurrentY + dragOriginY;
		}
		requestRedraw();
	});

	canvas.addEventListener("pointerup", function (event) {
		if (event.pointerId === dragPointerId) dragPointerId = -2;
		else return; // If the pointer released is not the one that's doing the dragging, ignore
		canvas.releasePointerCapture(event.pointerId);
		if (draggedDevice !== -1) {
			if (gameState.devicePositions[draggedDevice] !== draggedDeviceTargetPosition) {
				gameState.devicePositions[draggedDevice] = draggedDeviceTargetPosition;
			}
			draggedDevice = -1;
		}
		if (draggedWireEnd !== -1) {
			var selectedPosition = screenToGridPosition(event.offsetX, event.offsetY);
			finding_node: for (var i = 0; i < 3 * MAX_DEVICES; ++i) {
				if (!doesNodeExist(i)) continue;
				if (getNodePosition(i) === selectedPosition) {
					var targetWireEnd = i % 3 < 2 ? 1 : 0;
					// The start of the wire can only be output and the end only input
					if (targetWireEnd !== draggedWireEnd % 2) continue;
					// If the wire end is an end, it can only be plugged where there is nothing else
					if (targetWireEnd === 1) {
						for (var j = 0; j < 2 * MAX_WIRES; ++j) {
							if (gameState.wires[j] === -1) continue;
							if (gameState.wires[j] === i) continue finding_node;
						}
					}
					if (gameState.wires[draggedWireEnd] !== i) {
						gameState.wires[draggedWireEnd] = i;
					}
				}
			}
			var draggedWire = Math.floor(draggedWireEnd / 2)
			// Special case for gameState.wires being just added
			if (gameState.wires[2 * draggedWire] === gameState.wires[2 * draggedWire + 1]) deleteWire(draggedWire);
			draggedWireEnd = -1;
		}
		if (draggingView) {
			draggingView = false;
		}
		requestRedraw();
	});
}
// Otherwise we need to use mouse events
else {
	// TODO: implement when pointer events are done
}

function deleteWire(wire) {
	gameState.wires[2 * wire] = -1;
	gameState.wires[2 * wire + 1] = -1;
	// remove the wire from the stack
	for (var i = 0; i < gameState.wireCount; ++i) {
		if (gameState.wireStack[i] === wire) {
			for (var j = i + 1; j < gameState.wireCount; ++j) {
				gameState.wireStack[j - 1] = gameState.wireStack[j];
			}
			gameState.wireStack[gameState.wireCount - 1] = -1;
			gameState.wireCount = gameState.wireCount - 1;
			break;
		}
	}
}

function serialize() {
	return JSON.stringify(gameState);
}

function loadFromString(data) {
	try {
		var loadedGameState = normalizeLoadedGameState(JSON.parse(data));
		gameState = loadedGameState;
		updateExerciseContent();
		draw()
	}
	catch (error) {
		console.warn("Failed to load saved game state", error);
	}
}

buttonDelete.addEventListener("click", function () {
	addingDevice = -1
	selectAddDevice.value = "-1";
	console.log("Deleting")
	if (selectedDevice !== -1) {
		gameState.deviceKinds[selectedDevice] = DEVICE_KIND_NONE;
		for (var i = 0; i < 2 * MAX_WIRES; ++i) {
			var node = gameState.wires[i];
			if (node === -1) continue;
			if (Math.floor(node / 3) === selectedDevice) {
				deleteWire(Math.floor(i / 2));
			}
		}
	}
	if (selectedWire !== -1) {
		deleteWire(selectedWire);
	}
	selectedDevice = -1;
	buttonDelete.disabled = true;
	requestRedraw();
})

selectAddDevice.addEventListener("input", function () {
	addingDevice = parseInt(selectAddDevice.value);
	selectedWire = -1;
	selectedDevice = -1;
	buttonDelete.disabled = true;
})

buttonAddWire.addEventListener("click", function () {
	addingWire = true;
	selectedWire = -1;
	selectedDevice = -1;
	buttonDelete.disabled = true;
	buttonAddWire.disabled = true;
	addingDevice = -1
	selectAddDevice.value = "-1";
})

buttonStartEditing.addEventListener("click", function () {
	editing = true;
	toolbarView.hidden = true;
	toolbarEditing.hidden = false;
	clearInterval(simulationTimerHandle);
	for (var i = 0; i < gameState.nodeValues.length; ++i) {
		gameState.nodeValues[i] = false;
	}
	requestRedraw();
})

buttonFinishEditing.addEventListener("click", function () {
	editing = false;
	toolbarView.hidden = false;
	toolbarEditing.hidden = true;
	selectedWire = -1;
	selectedDevice = -1;
	draggedDevice = -1;
	draggedWireEnd = -1;
	simulationTimerHandle = setInterval(function () {
		simulateStep();
		requestRedraw();
	}, simulationTimeout);
})

saveButton.addEventListener("click", function () {
	saveGameStateToStorage();
})

/*document.getElementById("export-json").addEventListener("click", function () {
	var json = JSON.stringify(gameState, null, 2);
	navigator.clipboard.writeText(json).then(function () {
		alert("JSON skopírovaný do schránky!");
	}, function () {
		prompt("Skopíruj JSON:", json);
	});
});*/

document.getElementById("export-for-veduci").addEventListener("click", async function () {
	if (!manifest) {
		var resp = await fetch("testingManifest.json");
		manifest = await resp.json();
	}
	var commands = [];
	for (var key in manifest) {
		var storageKey = GAME_STORAGE_KEY + "_" + key;
		var saved = localStorage.getItem(storageKey);
		if (saved) {
			commands.push("localStorage.setItem(" + JSON.stringify(storageKey) + ", " + JSON.stringify(saved) + ");");
		}
		var solved = localStorage.getItem(key);
		if (solved) {
			commands.push("localStorage.setItem(" + JSON.stringify(key) + ", " + JSON.stringify(solved) + ");");
		}
	}
	if (commands.length === 0) {
		alert("Žiadny uložený stav na export.");
		return;
	}
	var script = commands.join("\n") + "\nlocation.reload();";
	navigator.clipboard.writeText(script).then(function () {
		alert("Príkaz skopírovaný do schránky! Pošli ho vedúcim.");
	}, function () {
		prompt("Skopíruj tento príkaz do riešenia:", script);
	});
});

reloadLevelButton.addEventListener("click", function () {
	if (!currentExerciseName) return;
	localStorage.removeItem(GAME_STORAGE_KEY + "_" + currentExerciseName);
	loadExercise(currentExerciseName);
})

if (zoomInButton) {
	zoomInButton.addEventListener("click", function () {
		zoomAroundCanvasCenter(ZOOM_STEP);
	});
}

if (zoomOutButton) {
	zoomOutButton.addEventListener("click", function () {
		zoomAroundCanvasCenter(1 / ZOOM_STEP);
	});
}

if (zoomResetButton) {
	zoomResetButton.addEventListener("click", function () {
		resetView();
		requestRedraw();
	});
}

function customTestZapnutie() {
	for (var i = 0; i < 16; i++) {
		simulateStep();
		if (gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 16; i++) {
		simulateStep();
		if (!gameState.nodeValues[3]) return false;
	}
	return true;
}

function customTestSetReset() {
	for (var i = 0; i < 13; i++) {
		simulateStep();
		if (gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 18; i++) {
		simulateStep();
		if (!gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[3] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 15; i++) {
		simulateStep();
		if (gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 14; i++) {
		simulateStep();
		if (!gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[3] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 16; i++) {
		simulateStep();
		if (gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[3] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 4; i++) {
		simulateStep();
		if (gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 20; i++) {
		simulateStep();
		if (!gameState.nodeValues[6]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 7; i++) {
		simulateStep();
		if (!gameState.nodeValues[6]) return false;
	}
	return true;
}

function customTestPrepinac() {
	for (var i = 0; i < 13; i++) {
		simulateStep();
		if (gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 18; i++) {
		simulateStep();
		if (!gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 15; i++) {
		simulateStep();
		if (gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 14; i++) {
		simulateStep();
		if (!gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 16; i++) {
		simulateStep();
		if (gameState.nodeValues[3]) return false;
	}
	gameState.nodeValues[0] = true;
	for (var i = 0; i < 8; i++) simulateStep();
	for (var i = 0; i < 20; i++) {
		simulateStep();
		if (!gameState.nodeValues[3]) return false;
	}
	return true;
}

function customTestHodiny() {
	gameState.nodeValues[3] = true;
	for (var i = 0; i < 8; i++) {
		if (gameState.nodeValues[0]) break;
		simulateStep();
	}
	for (var i = 0; i < 13; i++) {
		if (!gameState.nodeValues[0]) return false;
		simulateStep();
		for (var j = 0; j < 7; j++) {
			console.log("step", j);
			if (gameState.nodeValues[0]) return false;
			simulateStep();
		}
	}
	return true;
}


async function loadExercise(name) {
	if (!manifest) {
		var resp = await fetch("testingManifest.json");
		manifest = await resp.json();
	}
	var ex = manifest[name];
	if (!ex) { console.log("Exercise not found:", name); return; }
	currentExerciseName = name;

	// Reset game state
	gameState = createDefaultGameState();
	console.log("Loading exercise", name, ex);
	// Load saved state if exists, otherwise load from JSON file
	var storageKey = GAME_STORAGE_KEY + "_" + name;
	var saved = localStorage.getItem(storageKey);
	if (saved) {
		loadFromString(saved);
	} else if (ex.jsonFile) {
		var response = await fetch(ex.jsonFile);
		loadFromString(await response.text());
	}

	// For the puzzle with disabled AND, disable the option, otherwise enable it
	// At least for now, it's simplest to hard-code
	document.getElementById("option-add-and-gate").disabled = name === "chyba-and";

	// Bind test button
	var testBtn = document.getElementById("test-circuit");
	if (ex.solutionBody || ex.customTestId) {
		testBtn.hidden = false;
		testBtn.onclick = function () {
			var result;
			if (ex.customTestId) {
				fillArray(gameState.nodeValues, 0);
				switch (ex.customTestId) {
					case "zapnutie": result = customTestZapnutie(); break;
					case "set-reset": result = customTestSetReset(); break;
					case "prepinac": result = customTestPrepinac(); break;
					case "hodiny": result = customTestHodiny(); break;
				}
			}
			else {
				var solution = new Function("x", ex.solutionBody);
				result = test(ex.testInputCount, ex.testTimeLimit, solution) 
			}
			if (result){ 
				alert("Správne!");
				displayConfetti();
				localStorage.setItem(name, "solved");
				document.getElementById(name).classList.add("finished");
			}
			else alert("Nesprávne.");
			fillArray(gameState.nodeValues, false);
		};
	} else {
		testBtn.hidden = true;
		testBtn.onclick = null;
	}

	updateExerciseContent();
	resetView();
	requestRedraw();
}

async function markPreviouslyCompleted(){
	if (!manifest) {
		var resp = await fetch("testingManifest.json");
		manifest = await resp.json();
	}
	for (key in manifest){
		if (localStorage.getItem(key) === "solved") {
			var elem = document.getElementById(key)
			if (elem) elem.classList.add("finished");
		}
	}
}

function displayConfetti() {
    const colors = ['#ff0', '#0f0', '#0ff', '#f0f', '#f00', '#00f'];

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');

        const size = Math.floor(Math.random() * 8 + 4) + 'px';
        confetti.style.width = size;
        confetti.style.height = size;

        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        confetti.style.position = 'absolute';
        confetti.style.left = Math.random() * (window.innerWidth-50) + 'px';
        confetti.style.top = Math.random() * (window.innerHeight) / 2 + 'px';

        const rotate = Math.random() * 360;
        confetti.style.transform = `rotate(${rotate}deg)`;

        const duration = Math.random() * 2 + 2;
        confetti.style.transition = `transform ${duration}s linear, top ${duration}s linear, opacity ${duration}s`;

        document.body.appendChild(confetti);

        requestAnimationFrame(() => {
            confetti.style.top = (window.innerHeight-20) + 'px';
            confetti.style.transform = `rotate(${rotate + 360}deg)`;
            confetti.style.opacity = '0';
        });

        setTimeout(() => {
            confetti.remove();
        }, duration * 1000);

    }
}


updateCanvasSize();
resetView();
updateExerciseContent();
requestRedraw();

markPreviouslyCompleted().then(() => {});