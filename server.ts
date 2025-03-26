import { Connection, clusterApiUrl, Keypair, PublicKey, Transaction, SendTransactionError } from '@solana/web3.js';
import { createTransferInstruction, getAccount, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import fs from 'fs';
import express from 'express';

// Initialize the express engine
const app: express.Application = express();
// Take a port 3000 for running server.
const port: number = 3000;

// Read the keypair from the keypair.json file
const keypairPath = 'wallet1.json';
const keypairData = fs.readFileSync(keypairPath, 'utf8');
const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairData)));

// Extract the public key and print it to the console
const publicKey = keypair.publicKey.toBase58();
console.log(`Public Key: ${publicKey}`);

// Define the token mint address
const mintAddress = new PublicKey('HubuF6KkMvxtRSdq8GmbNkaupedBiSu9ZzuzCm5nBBgs');

// Fixed recipient address
const fixedRecipientAddress = new PublicKey('7KPGDuQtgox24zsfdm86HjizGxEncZtUpzu5BuNywnsV');

app.use(express.json());

app.post('/chat', async (req, res) => {
    try {
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

        // Use the fixed recipient address
        const recipientPublicKey = fixedRecipientAddress;
        console.log(`Fixed Recipient Public Key: ${recipientPublicKey.toBase58()}`);

        // Connect to Solana
        const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

        // Calculate the total amount to be transferred
        const num_blocks = 1
;
        const totalAmount = BigInt(num_blocks) 


        // Get the recipient's associated token account address
        const recipientTokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            recipientPublicKey,
            false // allowOwnerOffCurve
        );
        console.log(`Recipient Token Account: ${recipientTokenAccount.toBase58()}`);

        // Check if the source token account exists and has sufficient balance
        try {
            const sourceAccount = await getAccount(connection, sourceTokenAccountAddress);
            console.log(`Source Token Account Balance: ${sourceAccount.amount.toString()}`);

            if (sourceAccount.amount < totalAmount * BigInt(1e9)) {
                throw new Error(`Insufficient balance. Required: ${(totalAmount * BigInt(1e9)).toString()}, Available: ${sourceAccount.amount.toString()}`);
            }
        } catch (error) {
            throw new Error(`Error checking source token account: ${error.message}`);
        }

        // Check if the recipient token account exists
        let recipientAccountExists = false;
        try {
            await getAccount(connection, recipientTokenAccount);
            recipientAccountExists = true;
            console.log(`Recipient token account exists`);
        } catch (error) {
            console.log(`Recipient token account does not exist. Will create one.`);
        }

        // Process each block transaction
        
            const transaction = new Transaction();

            // If recipient token account doesn't exist and this is the first transaction, create it.
            if (!recipientAccountExists ) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        keypair.publicKey,         // payer
                        recipientTokenAccount,     // associated token account
                        fixedRecipientAddress,        // owner
                        mintAddress                // mint
                    )
                );
                recipientAccountExists = true; // Set to true so we don't try to create it again.
            }

            // Add transfer instruction
            transaction.add(
                createTransferInstruction(
                    sourceTokenAccountAddress,
                    recipientTokenAccount,      // Using the recipient's associated token account
                    keypair.publicKey,
                    totalAmount.toString(),     // Amount to transfer
                )
            );

            try {
                const signature = await connection.sendTransaction(transaction, [keypair], {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                });
                await connection.confirmTransaction(signature, 'confirmed');
                console.log(`Transaction } confirmed with signature: ${signature}`);
            } catch (error) {
                if (error instanceof SendTransactionError) {
                    console.error(`Failed to send transaction: ${error.message}`);
                    if (error.logs) {
                        console.error(`Transaction logs: ${error.logs.join('\n')}`);
                    }
                } else {
                    console.error(`Failed to send transaction: ${error.message}`);
                }
                throw error;
            }
        

        // Return response with transaction details.
        res.status(200).send({
            success: true,
            totalAmount: totalAmount.toString(),
  
        });

        console.log(`Successfully sent ${totalAmount.toString()} tokens`);
    } catch (error) {
        res.status(500).send({
            success: false,
            error: error.message
        });
        console.error(`Failed to send tokens: ${error.message}`);
    }
});

app.listen(port, () => {
    console.log(`TypeScript with Express running at http://localhost:${port}/`);
});
