
import solana
from solana.rpc.api import Client
from solana.publickey import PublicKey
from solana.transaction import Transaction
from spl.token.instructions import get_associated_token_address, create_associated_token_account, transfer_checked
from spl.token.constants import TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
from config import default_chat_config  # Import the default_chat_config
import hivemind


# Initialize token usage tracking
tokens_used = 0
user_message_counts = {}  # Dictionary to track messages for each user
MESSAGE_COST = 1  # Cost per message
MESSAGES_PER_PAYMENT = 10  # Number of messages per payment

logger = hivemind.get_logger(__file__)


from flask import Flask
from flask_cors import CORS
from flask_sock import Sock

import utils
import views

logger = hivemind.get_logger(__file__)

logger.info("Loading models")
models = utils.load_models()

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
sock = Sock(app)

logger.info("Pre-rendering index page")
index_html = views.render_index(app)


@app.route("/")
def main_page():
    return index_html


import http_api
import websocket_api

@app.route("/tokens_used", methods=["GET"])
def get_tokens_used():
    global tokens_used
    return jsonify({"tokens_used": tokens_used})

@app.route("/pay", methods=["POST"])
def pay():
    data = request.json
    user_id = data.get('user_id')
    payment_address = data.get('payment_address')
    amount = data.get('amount')

    # Process payment (this is a placeholder, replace with actual payment processing)
    if process_payment(payment_address, amount):
        user_message_counts[user_id] = user_message_counts.get(user_id, 0) + int(amount) * MESSAGES_PER_PAYMENT
        return jsonify({"success": True, "messages_remaining": user_message_counts[user_id]})
    else:
        return jsonify({"success": False, "error": "Payment failed"}), 400

@app.route("/send_message", methods=["POST"])
def send_message():
    global tokens_used
    data = request.json
    user_id = data.get('user_id')
    prompt = data.get('prompt', '')

    # Check if user has enough messages remaining
    if user_message_counts.get(user_id, 0) <= 0:
        return jsonify({"error": "Insufficient messages remaining"}), 403

    # Calculate the number of tokens in the prompt
    prompt_tokens = len(prompt.split())
    tokens_used += prompt_tokens

    # Simulate generation (replace this with actual generation logic)
    generated_text = "This is a generated response."
    generated_tokens = len(generated_text.split())
    tokens_used += generated_tokens

    # Decrement the user's message count
    user_message_counts[user_id] -= 1

    # Calculate remaining tokens
    max_length = default_chat_config.max_session_length
    remaining_tokens = max_length - tokens_used

    response = {
        'generated_text': generated_text,
        'tokens_used': tokens_used,
        'remaining_tokens': remaining_tokens,
        'messages_remaining': user_message_counts[user_id]
    }

    return jsonify(response)

@app.route("/transfer-token", methods=["POST"])
def transfer_token():
    data = request.json
    sender_public_key = data.get('senderPublicKey')
    recipient_public_key = data.get('recipientPublicKey')
    amount = int(data.get('amount', 0))  # Ensure amount is an integer
    
    if not all([sender_public_key, recipient_public_key, amount]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        # Connect to Solana devnet
        connection = Client("https://api.devnet.solana.com")
        
        # Convert string keys to PublicKey objects
        sender = PublicKey(sender_public_key)
        recipient = PublicKey(recipient_public_key)
        token_mint = PublicKey('4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4')
        
        # Get associated token addresses for sender and recipient
        sender_token_account = get_associated_token_address(
            owner=sender,
            mint=token_mint
        )
        
        recipient_token_account = get_associated_token_address(
            owner=recipient,
            mint=token_mint
        )
        
        # Check if recipient token account exists
        instructions = []
        
        try:
            # Try to get recipient account info to check if it exists
            recipient_account_info = connection.get_account_info(recipient_token_account)
            if not recipient_account_info['result']['value']:
                # If recipient token account doesn't exist, create it
                create_ata_ix = create_associated_token_account(
                    payer=sender,
                    owner=recipient,
                    mint=token_mint
                )
                instructions.append(create_ata_ix)
        except Exception:
            # If error occurs, assume we need to create the account
            create_ata_ix = create_associated_token_account(
                payer=sender,
                owner=recipient,
                mint=token_mint
            )
            instructions.append(create_ata_ix)
        
        # Add transfer instruction (using transfer_checked for safety)
        transfer_ix = transfer_checked(
            source=sender_token_account,
            mint=token_mint,
            dest=recipient_token_account,
            owner=sender,
            amount=amount,
            decimals=9,  # Standard decimals for most Solana tokens
            signers=[]
        )
        instructions.append(transfer_ix)
        
        # Get recent blockhash
        recent_blockhash = connection.get_recent_blockhash()
        
        # Create transaction
        transaction = Transaction()
        transaction.recent_blockhash = recent_blockhash['result']['value']['blockhash']
        transaction.fee_payer = sender
        
        # Add all instructions to transaction
        for instruction in instructions:
            transaction.add(instruction)
        
        # Serialize the transaction for the client to sign
        serialized_transaction = transaction.serialize()
        
        return jsonify({
            'transaction': serialized_transaction.hex(),
            'message': 'Transaction created successfully. Please sign and submit.'
        })
        
    except Exception as e:
        logger.error(f'Transaction creation failed: {str(e)}')
        return jsonify({'error': str(e)}), 500

def process_payment(payment_address, amount):
    # Placeholder function to process payment
    # Replace this with actual payment processing logic
    if payment_address == "4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4" and int(amount) >= MESSAGE_COST:
        return True
    return False
