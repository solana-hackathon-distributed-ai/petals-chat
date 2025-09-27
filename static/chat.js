var curModel = defaultModel;
const falconModel = "tiiuae/falcon-180B-chat";

function getConfig() {
    return modelConfigs[curModel];
}

var ws = null;
var position = 0;
const initialSessionLength = 512;
var sessionLength = initialSessionLength;
var connFailureBefore = false;

var totalElapsed, tokenCount;
let forceStop = false;

function openSession(callback) {
    let protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/api/v2/generate`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: "open_inference_session", model: curModel, max_length: sessionLength }));
        ws.onmessage = event => {
            const response = JSON.parse(event.data);
            if (!response.ok) {
                handleFailure(response.traceback);
                return;
            }
            callback();
        };
    };

    ws.onerror = _event => handleFailure("Connection failed");
    ws.onclose = _event => {
        if ($(".error-box").is(":hidden")) {
            handleFailure("Connection was closed", true);
        }
    };
}

function resetSession() {
    if (ws !== null && ws.readyState <= 1) {
        ws.close();
    }
    ws = null;
    position = 0;
}

function isWaitingForInputs() {
    return $(".human-replica textarea").length >= 1;
}

function sendReplica() {
    if (isWaitingForInputs()) {
        const aiPrompt = "Assistant:";
        const humanText = $(".human-replica:last textarea").val().trim();

        $(".human-replica:last").text(`Human: ${humanText}`);
	$(".dialogue").append($(`<div id="avatar2"></div>`));
	$(".dialogue").append($(
            `<p class="ai-replica">
	
                <span class="text">${aiPrompt} </span>
                <span class="loading-animation"></span>
                <span class="speed" style="display: none;"></span>
                <span class="generation-controls">
                    <a class="stop-generation" href="#">stop generation</a>
                </span>
                <span class="suggest-join" style="display: none;">
                    <b>Too slow?</b>
                    <a target="_blank" href="https://github.com/bigscience-workshop/petals#connect-your-gpu-and-increase-petals-capacity">Connect your GPU</a>
                    and increase Petals capacity!
                </span>
            </p>`
        ));
        animateLoading();
	$(".dialogue").append($(`<div id=avatar></div>`));
        $(".stop-generation").click(e => {
            e.preventDefault();
            forceStop = true;
        });
 const lastHumanMsg = $('.human-replica:last');
        lastHumanMsg.addClass('message message--human');
        const humanAvatar = $('#avatar2').clone().removeAttr('id'); // clone template
        lastHumanMsg.prepend(humanAvatar);
        const humanContent = $('<span class="message__content"></span>');
        humanContent.append(lastHumanMsg.text());
        lastHumanMsg.empty().append(humanAvatar, humanContent);
    } else {
        $(".loading-animation").show();
    }

    if (ws === null) {
        openSession(sendReplica);
        return;
    }

    const replicaDivs = $(".human-replica, .ai-replica .text");
    var replicas = [];
    for (var i = position; i < replicaDivs.length; i++) {
        const el = $(replicaDivs[i]);
        let phrase = el.text().trim();

        if (curModel === falconModel) {
            if (i < 2) continue;
            phrase = phrase.replace(/^Human:/, "User:");
            phrase = phrase.replace(/^Assistant:/, "Falcon:");
        }

        if (el.is(".human-replica")) {
            phrase += getConfig().chat.sep_token;
        } else if (i < replicaDivs.length - 1) {
            phrase += getConfig().chat.stop_token;
        }

        replicas.push(phrase);
    }

    const inputs = replicas.join("");
    position = replicaDivs.length;
    totalElapsed = 0;
    tokenCount = 0;

    receiveReplica(inputs);
}

function receiveReplica(inputs) {
    ws.send(JSON.stringify({
        type: "generate",
        inputs: inputs,
        max_new_tokens: 1,
        stop_sequence: getConfig().chat.stop_token,
        extra_stop_sequences: getConfig().chat.extra_stop_sequences,
        ...getConfig().chat.generation_params,
    }));

    var lastMessageTime = null;
    ws.onmessage = event => {
        connFailureBefore = false;

        const response = JSON.parse(event.data);
        if (!response.ok) {
            handleFailure(response.traceback);
            return;
        }

        if (lastMessageTime != null) {
            totalElapsed += performance.now() - lastMessageTime;
            tokenCount += response.token_count;
        }
        lastMessageTime = performance.now();

        const lastReplica = $(".ai-replica .text").last();
        let newText = lastReplica.text() + response.outputs;

        if (curModel !== falconModel) {
            newText = newText.replace(getConfig().chat.stop_token, "");
        }
        if (getConfig().chat.extra_stop_sequences !== null) {
            for (const seq of getConfig().chat.extra_stop_sequences) {
                newText = newText.replace(seq, "");
            }
        }

        lastReplica.text(newText);

        if (!response.stop && !forceStop) {
            if (tokenCount >= 1) {
                const speed = tokenCount / (totalElapsed / 1000);
                $(".speed")
                    .text(`Speed: ${speed.toFixed(1)} tokens/sec`)
                    .show();
                if (speed < 1) {
                    $(".suggest-join").show();
                }
            }
        } else {
            if (forceStop) {
                resetSession();
                forceStop = false;
            }
            $(".loading-animation, .speed, .suggest-join, .generation-controls").remove();
            appendTextArea();
        }
    };
}

function handleFailure(message, autoRetry = false) {
    resetSession();

    if (!isWaitingForInputs()) {
        if (message === "Connection failed" && !connFailureBefore) {
            autoRetry = true;
            connFailureBefore = true;
        }

        if (/Session .+ expired/.test(message)) {
            autoRetry = true;
        }

        const maxSessionLength = getConfig().chat.max_session_length;
        if (/Maximum length exceeded/.test(message) && sessionLength < maxSessionLength) {
            sessionLength = Math.min(sessionLength * 4, maxSessionLength);
            autoRetry = true;
        }

        if (autoRetry) {
            retry();
        } else {
            $(".loading-animation").hide();
            if (/attention cache is full/.test(message)) {
                $(".error-message").hide();
                $(".out-of-capacity").show();
            } else {
                $(".out-of-capacity").hide();
                $(".error-message").text(message).show();
            }
            $(".error-box").show();
        }
    }
}

function retry() {
    $(".error-box").hide();
    sendReplica();
}

function upgradeTextArea() {
    const textarea = $(".human-replica textarea");
    autosize(textarea);
    textarea[0].selectionStart = textarea[0].value.length;
    textarea.focus();

    textarea.on("keypress", e => {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            sendReplica();
        }
    });
}

function appendTextArea() {
    $(".dialogue").append(
        `<p class="human-replica"><textarea class="form-control" rows="2">Human: </textarea></p>`
    );
    upgradeTextArea();
}

const animFrames = ["⌛", "🧠"];
var curFrame = 0;

function animateLoading() {
    $(".loading-animation").html("&nbsp;" + animFrames[curFrame]);
    curFrame = (curFrame + 1) % animFrames.length;
}

$(() => {
    upgradeTextArea();

    $(".family-selector label").click(function (e) {
        if (!isWaitingForInputs()) {
            alert("Can't switch the model while the AI is writing a response. Please refresh the page");
            e.preventDefault();
            return;
        }

        const radio = $(`#${$(this).attr("for")}`);
        if (radio.is(":checked")) {
            setTimeout(() => $(".human-replica textarea").focus(), 10);
            return;
        }

        const curFamily = radio.attr("value");
        $(".model-selector").hide();
        const firstLabel = $(`.model-selector[data-family=${curFamily}]`).show().children("label:first");
        firstLabel.click();
        firstLabel.trigger("click");
    });

    $(".model-selector label").click(function (e) {
        if (!isWaitingForInputs()) {
            alert("Can't switch the model while the AI is writing a response. Please refresh the page");
            e.preventDefault();
            return;
        }

        curModel = $(`#${$(this).attr("for")}`).attr("value");
        $(".dialogue p").slice(2).remove();
        sessionLength = initialSessionLength;
        resetSession();
        appendTextArea();

        $(".model-name")
            .text($(this).text())
            .attr("href", getConfig().frontend.model_card);
        $(".license-link").attr("href", getConfig().frontend.license);

        setTimeout(() => $(".human-replica textarea").focus(), 10);
    });

    $(".retry-link").click(e => {
        e.preventDefault();
        retry();
    });

    setInterval(animateLoading, 2000);
});
