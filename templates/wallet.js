// DOM elements
const connectButton = document.getElementById('connect-wallet');
const statusDiv = document.getElementById('status');

// Initialize Solana connection
const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');

// Detect Phantom provider
function getProvider() {
    if ('solana' in window) {
        const provider = window.solana;
        if (provider.isPhantom) {
            return provider;
        }
        statusDiv.textContent = 'Detected a wallet, but it’s not Phantom. Please use Phantom.';
        statusDiv.style.color = 'red';
        return null;
    }
    statusDiv.textContent = 'No wallet detected. Please install Phantom: https://phantom.app';
    statusDiv.style.color = 'red';
    return null;
}

const provider = getProvider();
let isConnected = false;

// Connect wallet
async function connectWallet() {
    if (!provider) {
        statusDiv.textContent = 'Phantom wallet not available. Install it from https://phantom.app';
        return;
    }

    try {
        connectButton.disabled = true;
        statusDiv.textContent = 'Connecting to wallet...';
        statusDiv.style.color = 'orange';

        await provider.connect();
        isConnected = true;

        const publicKey = provider.publicKey.toString();
        connectButton.textContent = 'Disconnect Wallet';
        connectButton.disabled = false;
        statusDiv.textContent = `Connected: ${publicKey}`;
        statusDiv.style.color = 'white';

        console.log('Wallet connected:', publicKey);
    } catch (error) {
        connectButton.disabled = false;
        statusDiv.textContent = `Failed to connect: ${error.message}`;
        statusDiv.style.color = 'red';
        console.error('Connection error:', error);
    }
}

// Disconnect wallet
async function disconnectWallet() {
    if (!provider || !isConnected) return;

    try {
        await provider.disconnect();
        isConnected = false;

        connectButton.textContent = 'Connect Wallet';
        statusDiv.textContent = 'Disconnected';
        statusDiv.style.color = 'black';
        console.log('Wallet disconnected');
    } catch (error) {
        statusDiv.textContent = `Disconnection failed: ${error.message}`;
        statusDiv.style.color = 'red';
        console.error('Disconnection error:', error);
    }
}

// Toggle connect/disconnect
connectButton.addEventListener('click', () => {
    if (!isConnected) {
        connectWallet();
    } else {
        disconnectWallet();
    }
});

// Handle wallet events
if (provider) {
    provider.on('connect', (publicKey) => {
        isConnected = true;
        connectButton.textContent = 'Disconnect Wallet';
        statusDiv.textContent = `Connected: ${publicKey.toString()}`;
        statusDiv.style.color = 'blue';
        console.log('Connected event:', publicKey.toString());
    });

    provider.on('disconnect', () => {
        isConnected = false;
        connectButton.textContent = 'Connect Wallet';
        statusDiv.textContent = 'Disconnected';
        statusDiv.style.color = 'black';
        console.log('Disconnected event');
    });

    // Check if already connected
    if (provider.isConnected) {
        connectWallet();
    }
}

async function buyCredits() {
    if (!isConnected || !provider) {
        alert("Please connect your Phantom wallet first");
        return;
    }

    try {
        const creditsInput = document.getElementById('credits-input');
        const tokenAmount = parseInt(creditsInput.value);
        if (isNaN(tokenAmount) || tokenAmount <= 0) {
            alert("Please enter a valid number of tokens");
            return;
        }

        // Token parameters
        const tokenMint = new solanaWeb3.PublicKey('4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4');
        const receiverAddress = new solanaWeb3.PublicKey('YOUR_RECEIVER_WALLET_ADDRESS'); // Replace with your actual wallet

        // Find the user's token account for this specific token
        const userTokenAccounts = await connection.getParsedTokenAccountsByOwner(
            provider.publicKey,
            { mint: tokenMint }
        );

        if (userTokenAccounts.value.length === 0) {
            alert("You don't have any of these tokens in your wallet.");
            return;
        }

        // Get the user's token account address
        const userTokenAccount = userTokenAccounts.value[0].pubkey;

        // Find or create the receiver's token account
        let receiverTokenAccount;
        try {
            // Try to find existing token account
            const receiverTokenAccounts = await connection.getParsedTokenAccountsByOwner(
                receiverAddress,
                { mint: tokenMint }
            );

            if (receiverTokenAccounts.value.length > 0) {
                receiverTokenAccount = receiverTokenAccounts.value[0].pubkey;
            } else {
                alert("Receiver doesn't have a token account for this token.");
                return;
            }
        } catch (err) {
            alert("Error finding receiver token account: " + err.message);
            return;
        }

        // Create transfer instruction
        const transferInstruction = splToken.Token.createTransferInstruction(
            splToken.TOKEN_PROGRAM_ID,
            userTokenAccount,
            receiverTokenAccount,
            provider.publicKey,
            [],
            tokenAmount * 1000000 // Assuming 6 decimals, adjust if your token has different decimals
        );

        // Create transaction
        const transaction = new solanaWeb3.Transaction().add(transferInstruction);

        // Set recent blockhash
        transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = provider.publicKey;

        // Sign and send transaction
        const signed = await provider.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());

        console.log("Transaction sent:", signature);

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature);
        console.log("Transaction confirmed:", confirmation);

        // Send transaction signature to backend for verification
        const response = await fetch('/verify_token_payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: provider.publicKey.toString(),
                transaction_signature: signature,
                token_amount: tokenAmount
            })
        });

        const data = await response.json();
        if (data.success) {
            alert(`Payment successful! You have ${data.messages_remaining} messages remaining.`);
        } else {
            alert(`Payment verification failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Transaction error:', error);
        alert(`Transaction failed: ${error.message}`);
    }
}