var curModel = defaultModel;
const falconModel = "tiiuae/falcon-180B-chat";

const AI_TOKEN_MINT = "HubuF6KkMvxtRSdq8GmbNkaupedBiSu9ZzuzCm5nBBgs"; // AIcrunch Token Mint Address
const AI_PAYMENT_WALLET = "4d9WDb8dWs5FKCyQxMXAtiwDDsiqFitj6A3PEkz3mK8y"; // payment wallet address
const SOLANA_RPC = "https://api.devnet.solana.com"; // Devnet RPC 
// Example usage
const Transaction = new solanaWeb3.Transaction();
console.log(Transaction);

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

function openSession() {
    let protocol = location.protocol == "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/api/v2/generate`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: "open_inference_session", model: curModel, max_length: sessionLength }));
        ws.onmessage = event => {
            const response = JSON.parse(event.data);
            if (!response.ok) {
                handleFailure(response.traceback);
                return;
            }

            sendReplica();
        };
    };

    ws.onerror = _event => handleFailure(`Connection failed`);
    ws.onclose = _event => {
        if ($(".error-box").is(":hidden")) {
            handleFailure(`Connection was closed`, true);
        }
    };
}

async function payForAIMessage(sender) {
    const msg = new solanaWeb3.Message();
    try {
        const response = await fetch('http://localhost:3000/chat', {
            method: 'POST',
            mode: 'cors', // Enable CORS
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Wildcard CORS origin
                'Access-Control-Allow-Methods': 'POST, OPTIONS', // Allowed HTTP methods
                'Access-Control-Allow-Headers': 'Content-Type' // Allowed headers
            },
            body: JSON.stringify({ source: sender })
        });

        // Step 1: Decode the base64 transaction data
        const transactionBuffer = buffer.Buffer.from(data.transaction, "base64");

        // Step 2: Deserialize the legacy transaction
        const transaction = Transaction.from(transactionBuffer);

        // Step 3: Sign the transaction with the wallet
        const signedTransaction = await window.solana.signTransaction(transaction);

        // Step 4: Send the transaction
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature, "confirmed");

        console.log(`Transaction confirmed: ${signature}`);
        return signature;
        } catch (error) {
            console.error("Error sending transaction:", error.message);
            throw error; // Re-throw to handle it in the calling function if needed
        }
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
    ws.onmessage = async event => {
        connFailureBefore = false;  // We've managed to connect after a possible failure

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

        const lastReplica = $('.ai-replica .text').last();
        var newText = lastReplica.text() + response.outputs;
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
                $('.speed')
                    .text(`Speed: ${speed.toFixed(1)} tokens/sec`)
                    .show();
                if (speed < 1) {
                    $('.suggest-join').show();
                }
            }
        } else {
            if (forceStop) {
                resetSession();
                forceStop = false;
            }
            $('.loading-animation, .speed, .suggest-join, .generation-controls').remove();
            appendTextArea();

            // Pay for the generated tokens
            const sender = window.solana?.publicKey?.toString();
            if (sender) {
                await payForAIMessage(sender);
            }
        }
    };
}

function resetSession() {
    if (ws !== null && ws.readyState <= 1) {  // If readyState is "connecting" or "opened"
        ws.close();
    }
    ws = null;
    position = 0;
}

function isWaitingForInputs() {
    return $('.human-replica textarea').length >= 1;
}

function sendReplica() {
    if (isWaitingForInputs()) {
        const aiPrompt = "Assistant:";
        $('.human-replica:last').text($('.human-replica:last textarea').val());
        $('.dialogue').append($(
            '<p class="ai-replica">' +
            `<span class="text">${aiPrompt}</span>` +
            '<span class="loading-animation"></span>' +
            '<span class="speed" style="display: none;"></span>' +
            '<span class="generation-controls"><a class="stop-generation" href=#>stop generation</a></span>' +
            '<span class="suggest-join" style="display: none;">' +
            '<b>Too slow?</b> ' +
            '<a target="_blank" href="https://github.com/bigscience-workshop/petals#connect-your-gpu-and-increase-petals-capacity">Connect your GPU</a> ' +
            'and increase Petals capacity!' +
            '</span>' +
            '</p>'));
        animateLoading();
        $('.stop-generation').click(e => {
            e.preventDefault();
            console.log("Stop generation");
            forceStop = true;
        });
    } else {
        $('.loading-animation').show();
    }

    if (ws === null) {
        openSession();
        return;
    }

    const replicaDivs = $('.human-replica, .ai-replica .text');
    var replicas = [];
    for (var i = position; i < replicaDivs.length; i++) {
        const el = $(replicaDivs[i]);
        var phrase = el.text();
        if (curModel === falconModel) {
            if (i < 2) {
                // Skip the system prompt and the 1st assistant's message to match the HF demo format precisely
                continue;
            }
            phrase = phrase.replace(/^Human:/, 'User:');
            phrase = phrase.replace(/^Assistant:/, 'Falcon:');
        }
        if (el.is(".human-replica")) {
            phrase += getConfig().chat.sep_token;
        } else
            if (i < replicaDivs.length - 1) {
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

function handleFailure(message, autoRetry = false) {
    resetSession();
    if (!isWaitingForInputs()) {
        // Show the error and the retry button only if a user is waiting for the generation results

        if (message === "Connection failed" && !connFailureBefore) {
            autoRetry = true;
            connFailureBefore = true;
        }
        if (/Session .+ expired/.test(message)) {
            autoRetry = true;
        }
        const maxSessionLength = getConfig().chat.max_session_length;
        if (/Maximum length exceeded/.test(message) && sessionLength < maxSessionLength) {
            // We gradually increase sessionLength to save server resources. Default: 512 -> 2048 -> 8192 (if supported)
            sessionLength = Math.min(sessionLength * 4, maxSessionLength);
            autoRetry = true;
        }

        if (autoRetry) {
            retry();
        } else {
            $('.loading-animation').hide();
            if (/attention cache is full/.test(message)) {
                $('.error-message').hide();
                $('.out-of-capacity').show();
            } else {
                $('.out-of-capacity').hide();
                $('.error-message').text(message).show();
            }
            $('.error-box').show();
        }
    }
}

function retry() {
    $('.error-box').hide();
    sendReplica();
}

function upgradeTextArea() {
    const textarea = $('.human-replica textarea');
    autosize(textarea);
    textarea[0].selectionStart = textarea[0].value.length;
    textarea.focus();

    textarea.on('keypress', e => {
        if (e.which == 13 && !e.shiftKey) {
            e.preventDefault();
            sendReplica();
        }
    });
}

function appendTextArea() {
    const humanPrompt = "Human: ";
    $('.dialogue').append($(
        `<p class="human-replica"><textarea class="form-control" id="exampleTextarea" rows="2">${humanPrompt}</textarea></p>`
    ));
    upgradeTextArea();
}

const animFrames = ["⌛", "🧠"];
var curFrame = 0;

function animateLoading() {
    $('.loading-animation').html(' &nbsp;' + animFrames[curFrame]);
    curFrame = (curFrame + 1) % animFrames.length;
}

$(() => {
    upgradeTextArea();

    $('.family-selector label').click(function (e) {
        if (!isWaitingForInputs()) {
            alert("Can't switch the model while the AI is writing a response. Please refresh the page");
            e.preventDefault();
            return;
        }

        const radio = $(`#${$(this).attr("for")}`);
        if (radio.is(":checked")) {
            setTimeout(() => $('.human-replica textarea').focus(), 10);
            return;
        }

        const curFamily = radio.attr("value");
        $('.model-selector').hide();
        const firstLabel = $(`.model-selector[data-family=${curFamily}]`).show().children('label:first');
        firstLabel.click();
        firstLabel.trigger('click');
    });
    $('.model-selector label').click(function (e) {
        if (!isWaitingForInputs()) {
            alert("Can't switch the model while the AI is writing a response. Please refresh the page");
            e.preventDefault();
            return;
        }

        curModel = $(`#${$(this).attr("for")}`).attr("value");
        $('.dialogue p').slice(2).remove();

        sessionLength = initialSessionLength;
        resetSession();
        appendTextArea();

        $('.model-name')
            .text($(this).text())
            .attr('href', getConfig().frontend.model_card);
        $('.license-link').attr('href', getConfig().frontend.license);
        setTimeout(() => $('.human-replica textarea').focus(), 10);
    });
    $('.retry-link').click(e => {
        e.preventDefault();
        retry();
    });

    setInterval(animateLoading, 2000);
});
