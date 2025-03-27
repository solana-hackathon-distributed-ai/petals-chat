import { Connection, clusterApiUrl, Keypair, PublicKey, Transaction, SendTransactionError } from '@solana/web3.js';
import { createTransferInstruction, getAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import Buffer from 'buffer'


// Initialize the express engine
const app: express.Application = express();

// Take a port 3000 for running server.
const port: number = 3000;
// Enable CORS
app.use(cors());
// Read the keypair from the keypair.json file
const keypairPath = 'wallet1.json';
const keypairData = fs.readFileSync(keypairPath, 'utf8');
const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairData)));

// Extract the public key
const publicKey = keypair.publicKey.toBase58();
// Print the public key to the console
console.log(`Public Key: ${publicKey}`);

// Define the token mint address and token account addresses
const mintAddress = new PublicKey('HubuF6KkMvxtRSdq8GmbNkaupedBiSu9ZzuzCm5nBBgs');
const sourceTokenAccountAddress = new PublicKey('6hoaHQYthsgsEw3Y9r9vAGw7cyqp7A1iFB2BghTNXx8y');
const fundingRecipientAddress = new PublicKey('4RTQxBrL8ebJnyL2LMTfoeBPVZMkywZBmGMbwvcJMbvr');

// Fixed recipient address
const fixedRecipientAddress = new PublicKey('7KPGDuQtgox24zsfdm86HjizGxEncZtUpzu5BuNywnsV');
// Handling requests
app.use(express.json());


app.post('/chat', async (req, res) => {

    // Parse the request body for num_blocks, amount_per_block, and source address.
    //const num_blocks = BigInt(req.body.num_blocks);
    // const amount_per_block = BigInt(req.body.amount_per_block);
    const source = req.body.source; // Source token account address from JSON

    //console.log(`Received request to send ${amount_per_block} tokens for ${num_blocks} blocks from source: ${source}`);

    // Validate the source address from the JSON
    const sourceTokenAccountAddress = await getAssociatedTokenAddress(
        mintAddress,
        new PublicKey(source),
        false // allowOwnerOffCurve if necessary
    );
    try {

        console.log(`Source Token Account: ${sourceTokenAccountAddress.toBase58()}`);
    } catch (error) {
        throw new Error(`Invalid source address: ${error.message}`);
    }

    const sourcePublicKey = new PublicKey(source);
    ///const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Get source and recipient token accounts
    const sourceTokenAccount = await getAssociatedTokenAddress(mintAddress, sourcePublicKey, false);
    const recipientTokenAccount = await getAssociatedTokenAddress(mintAddress, fixedRecipientAddress, false);

    console.log(`Source Token Account: ${sourceTokenAccount.toBase58()}`);
    console.log(`Recipient Token Account: ${recipientTokenAccount.toBase58()}`);

    // Calculate total amount
    const totalAmount = BigInt(1)

    // Construct transaction (DO NOT SIGN)
    const transaction = new Transaction().add(
        createTransferInstruction(
            sourceTokenAccount,
            recipientTokenAccount,
            sourcePublicKey, // Must be signed by the source wallet
            totalAmount
        )
    );
    try {
        const transactionBuffer = transaction.serialize();

        // Convert the Buffer to a base64 string
        const base64Transaction = transactionBuffer.toString("base64"); // No need for Buffer.from here!

        // Send the base64 string to the frontend
        res.status(200).send({
            success: true,
            transaction: base64Transaction, // Send the raw base64 string (no JSON.stringify!)
        });

    } catch (error) {
        res.status(500).send({ success: false, error: error.message });
        console.error(`Failed to create transaction: ${error.message}`);
    }
})


app.listen(port, () => {
    console.log(`TypeScript with Express running at http://localhost:${port}/`);
});