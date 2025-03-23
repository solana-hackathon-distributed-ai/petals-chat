var curModel = defaultModel;
const falconModel = "tiiuae/falcon-180B-chat";
const AI_TOKEN_MINT = "4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4"; // AIcrunch Token Mint Address
const AI_PAYMENT_WALLET = "4d9WDb8dWs5FKCyQxMXAtiwDDsiqFitj6A3PEkz3mK8y"; // payment wallet address
const SOLANA_RPC = "https://api.devnet.solana.com"; // Devnet RPC 

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
            }
        };
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
    // Fetch AIcrunch token balance for the collected wallet address
   

    async function payForAIMessage(sender) {
        const connection = new solanaWeb3.Connection(SOLANA_RPC, "confirmed");
        const senderPubKey = new solanaWeb3.PublicKey(sender);
        const receiverPubKey = new solanaWeb3.PublicKey(AI_PAYMENT_WALLET);
        const tokenMintPubKey = new solanaWeb3.PublicKey(AI_TOKEN_MINT);
    
        try {
            console.log("🔄 Fetching sender and receiver token accounts...");
    
            // Get Associated Token Accounts (ATAs) for sender and receiver
            const senderTokenAccount = await window.getAssociatedTokenAddress(
                tokenMintPubKey,
                senderPubKey
            );
            const receiverTokenAccount = await window.getAssociatedTokenAddress(
                tokenMintPubKey,
                receiverPubKey
            );
    
            console.log("✅ Found sender and receiver token accounts.");
    
            // Create a transaction to transfer 1 AIcrunch token
            const transaction = new solanaWeb3.Transaction().add(
                window.createTransferInstruction(
                    senderTokenAccount,
                    receiverTokenAccount,
                    senderPubKey,
                    1 * 10 ** 6, // 1 AIcrunch token (6 decimals)
                    [],
                    window.TOKEN_PROGRAM_ID
                )
            );
    
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPubKey;
    
            console.log("🔄 Signing transaction...");
            const signedTransaction = await window.solana.signTransaction(transaction);
            console.log("✅ Transaction signed.");
    
            console.log("🔄 Sending transaction...");
            const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
                skipPreflight: false,
                preflightCommitment: "confirmed",
            });
    
            console.log(`✅ AI Payment Success: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

            // ✅ Wait for transaction confirmation before proceeding
            await connection.confirmTransaction(signature, "confirmed");
            console.log("✅ Transaction confirmed on the blockchain.");

            return true;
        } catch (err) {
            console.error("❌ AI Payment Failed:", err);
            alert("Transaction failed! Error: " + err.message);
            return false;
        }
    }
    // Refresh token balance after transactions
    async function updateBalance() {
        const walletAddress = window.solana?.publicKey?.toString();
        if (!walletAddress) return;
    
        const balance = await getTokenBalance(walletAddress);
    
        const balanceElement = document.getElementById("token-balance");
        if (balanceElement) {
            balanceElement.innerText = `Balance: ${balance} AIcrunch`;
        } else {
            console.error("❌ Token balance UI element not found.");
        }
    }
    async function upgradeTextArea() {
        const textarea = document.querySelector('.human-replica textarea');
    
        if (!textarea) {
            console.error("Textarea not found!");
            return;
        }
    
        textarea.focus();
    
        const walletAddress = window.solana?.publicKey?.toString();
        if (!walletAddress) {
            alert("Connect your wallet to chat.");
            return;
        }
    
        const tokenBalance = await getTokenBalance(walletAddress);
        console.log("AIcrunch Token Balance:", tokenBalance);
    
        if (tokenBalance <= 0) {
            alert("You need AIcrunch tokens to chat. Buy more tokens to continue.");
            return;
        }
    
        // Remove any previous event listeners to prevent multiple triggers
        textarea.removeEventListener("keydown", handleEnterKey);
        textarea.addEventListener("keydown", handleEnterKey);
    }
    
    // Handle Enter key event separately
    async function handleEnterKey(e) {
        if (e.key === "Enter" && !e.shiftKey) {  
            e.preventDefault();  
            console.log("Enter key pressed. Processing transaction...");
    
            const walletAddress = window.solana?.publicKey?.toString();
            if (!walletAddress) {
                alert("Wallet not connected.");
                return;
            }
    
            const success = await payForAIMessage(walletAddress);
            if (!success) {
                alert("Transaction failed! Unable to process AI message.");
                return;
            }
            console.log("✅ Payment successful, proceeding with AI response...");
            updateBalance(); // Refresh balance after transaction
            sendReplica(); // Proceed with AI response
        }
    }
    

    


    
    function appendTextArea() {

        const humanPrompt = "Human: ";
        $('.dialogue').append($(
            `<p class="human-replica"><textarea class="form-control" id="exampleTextarea" rows="2">${humanPrompt}</textarea></p>`
        ));
        setTimeout(upgradeTextArea, 100);

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
