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
async function prepareTransaction(transactionJson) {
    try {
        // Establish connection
        const connection = new solanaWeb3.Connection(
            solanaWeb3.clusterApiUrl('devnet'), // or mainnet-beta
            'confirmed'
        );

        // Create a new transaction
        const transaction = new solanaWeb3.Transaction();

        // Handle instructions
        if (transactionJson.instructions && transactionJson.instructions.length > 0) {
            transactionJson.instructions.forEach(instruction => {
                // Validate keys
                const validKeys = instruction.keys.map(key => ({
                    pubkey: new solanaWeb3.PublicKey(key.pubkey),
                    isSigner: key.isSigner || false,
                    isWritable: key.isWritable || false
                }));

                // Create transaction instruction
                const txInstruction = new solanaWeb3.TransactionInstruction({
                    keys: validKeys,
                    programId: new solanaWeb3.PublicKey(instruction.programId),
                    data: Buffer.from(instruction.data || [])
                });

                transaction.add(txInstruction);
            });
        }

        // Get recent blockhash if not provided
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        // Handle fee payer
        if (transactionJson.signers && transactionJson.signers.length > 0) {
            // Assume first signer is fee payer
            const feePayerPublicKey = new solanaWeb3.PublicKey(transactionJson.signers[0]);
            transaction.feePayer = feePayerPublicKey;
          
        } else {
            throw new Error('No fee payer specified');
        }
        
        return { transaction, connection };
    } catch (error) {
        console.error('Transaction preparation error:', error);
        throw error;
    }
}
async function payForAIMessage(sender) {
    
    try {
        // 1. Request signature from backend
        const authResponse = await fetch('/api/request-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: sender })
        });
        if (!authResponse.ok) throw new Error('Auth request failed');
        const { message, network } = await authResponse.json();

        // 2. Prepare message for signing
        const encodedMsg = new TextEncoder().encode(message);

        // 3. Sign with Phantom Wallet
        if (!window.solana?.isConnected) await window.solana.connect();
        const { publicKey, signature: walletSignature } = await window.solana.signMessage(encodedMsg);

        // 4. Verify signature with backend
        const verificationResponse = await fetch('/api/verify-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                publicKey: publicKey.toString(),
                message: message,
                signature: Array.from(walletSignature),
                network: network
            })
        });
        if (!verificationResponse.ok) throw new Error('Verification failed');
        const verification = await verificationResponse.json();
        if (!verification.verified) throw new Error('Signature verification failed');

        // 5. Get transaction from backend
        const paymentResponse = await fetch('/api/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: sender })
        });
        
        if (!paymentResponse.ok) throw new Error('Transaction creation failed');
        const { transaction: base64Tx } = await paymentResponse.json();

        // 6. Deserialize and send transaction
        const txBuffer = Uint8Array.from(atob(base64Tx), c => c.charCodeAt(0));
        const transaction = solanaWeb3.Transaction.from(txBuffer);
         
        const signedTx = await window.solana.signTransaction(transaction);
        const connection = new solanaWeb3.Connection(
            solanaWeb3.clusterApiUrl(network || 'devnet'),
            'confirmed'
        );

        const signature = await connection.sendRawTransaction(signedTx.serialize());
        const confirmation = await connection.confirmTransaction(signature);
        console.log("The transaction confirmation is", confirmation );
 


        return {
            signature,
            confirmation,
            explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${network}`
        };

    } catch (error) {
        //console.log("Transaction signatures:", transaction.signatures);
        console.error('Payment failed:', error);
        throw new Error(error.message || 'Payment process failed');
    }
}

/*async function payForAIMessage(sender) {
    try {
        // 1. Request signature from backend
        const { message, network } = await fetch('/api/request-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: sender })
        })

        // 2. Prepare message for signing
        const encodedMsg = new TextEncoder().encode(message);

        // 3. Sign with Phantom Wallet
        if (!window.solana?.isConnected) await window.solana.connect();
        const { publicKey, signature: walletSignature } = await window.solana.signMessage(encodedMsg);

        // 4. Verify signature with backend
        const verification = await fetch('/api/verify-signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                publicKey: publicKey.toString(),
                message: message,
                signature: Array.from(walletSignature),
                network: network
            })
        })

        if (!verification.verified) throw new Error('Signature verification failed');

        // 5. Get transaction from backend after verification
        const { transaction: txData } = await fetch('/api/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: sender
            })
        })
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Failed to create transaction');
        }
        // 6. Deserialize and send transaction
        const txBuffer = buffer.Buffer.from(txData, 'base64');
        const transaction = solanaWeb3.Transaction.from(txBuffer);

        const signedTx = await window.solana.signTransaction(transaction);
        const connection = new solanaWeb3.Connection(
            solanaWeb3.clusterApiUrl(network || 'devnet'),
            'confirmed'
        );

        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature);

        return signature;

    } catch (error) {
        console.error('Payment failed:', error);
        throw error;
    }
}*/
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
            console.log("the sender is", sender);
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
