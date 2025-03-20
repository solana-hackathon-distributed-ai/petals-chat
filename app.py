import hivemind
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from flask_sock import Sock

import utils
import views
from config import default_chat_config, MODEL_FAMILIES,DEFAULT_MODEL  # Import the default_chat_config and MODEL_FAMILIES

logger = hivemind.get_logger(__file__)

logger.info("Loading models")
models = utils.load_models()

# Initialize token usage tracking
tokens_used = 0
user_message_counts = {}  # Dictionary to track messages for each user
MESSAGE_COST = 1  # Cost per message
MESSAGES_PER_PAYMENT = 10  # Number of messages per payment

logger.info("Starting Flask app")
app = Flask(__name__)
CORS(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}
sock = Sock(app)

logger.info("Pre-rendering index page")
index_html = views.render_index(app)

@app.route("/")
def main_page():
    # Create model_config_json
    model_config_json = {}  # Populate this appropriately
    
    return render_template('index.html', 
                          model_families=MODEL_FAMILIES,
                          default_model=DEFAULT_MODEL,
                          model_config_json=model_config_json)
def verify_token_transfer(signature, token_mint, receiver_address):
    """
    Verify that a token transfer transaction was successful and was sent to the expected receiver
    
    Args:
        signature: Transaction signature
        token_mint: The token mint address
        receiver_address: The wallet address that should receive the payment
        
    Returns:
        bool: True if verified, False otherwise
    """
    try:
        # Connect to Solana RPC
        rpc_url = "https://api.devnet.solana.com"  # Use mainnet for production
        
        # Get transaction details
        headers = {"Content-Type": "application/json"}
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [
                signature,
                {"encoding": "jsonParsed", "commitment": "confirmed"}
            ]
        }
        
        response = requests.post(rpc_url, json=payload, headers=headers)
        data = response.json()
        
        # Check if transaction exists
        if "result" not in data or data["result"] is None:
            print(f"Transaction not found: {signature}")
            return False
        
        # Check if transaction was successful
        if data["result"]["meta"]["err"] is not None:
            print(f"Transaction failed: {signature}")
            return False
            
        # For SPL token transfers, we need to check parsed instructions
        instructions = data["result"]["transaction"]["message"]["instructions"]
        
        # Look for token transfer instruction
        for instruction in instructions:
            # Check if it's a token program instruction
            if "parsed" in instruction and instruction["program"] == "spl-token":
                # Check if it's a transfer instruction
                if instruction["parsed"]["type"] == "transfer":
                    info = instruction["parsed"]["info"]
                    
                    # Check the mint matches our expected token
                    if "mint" in info and info["mint"] != token_mint:
                        continue
                        
                    # Check the destination matches our receiver
                    if info["destination"] == receiver_address:
                        # Success! This is a valid token transfer to our address
                        return True
        
        # If we got here, no matching transfer instruction was found
        print(f"No valid token transfer found in transaction {signature}")
        return False
        
    except Exception as e:
        print(f"Error verifying token transfer: {str(e)}")
        return False

@app.route("/verify_token_payment", methods=["POST"])
def verify_token_payment():
    data = request.json
    user_id = data.get('user_id')
    transaction_signature = data.get('transaction_signature')
    token_amount = int(data.get('token_amount', 0))
    
    # Verify the transaction on Solana blockchain
    if verify_token_transfer(
        transaction_signature,
        token_mint="4pQaVgu9BdjTkms4pm2VqbTypqKB4URLHVKsakvqFeh4",
        receiver_address="EK6ZQQB9k6JyNsG4ZTNbxpCSognpGBaps1StASMDFXFz"  # Your wallet address
    ):
        # Calculate messages: 1 token = 10 messages
        messages_to_add = token_amount * 10
        
        # Update user's message count
        user_message_counts[user_id] = user_message_counts.get(user_id, 0) + messages_to_add
        
        return jsonify({
            "success": True, 
            "messages_remaining": user_message_counts[user_id],
            "tokens_received": token_amount
        })
    else:
        return jsonify({
            "success": False, 
            "error": "Could not verify token transfer"
        })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
