-- Ensure tables are created within the public schema owned by stakeout_user
ALTER SCHEMA public OWNER TO stakeout_user;

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  account_status VARCHAR(20) DEFAULT 'active',
  balance DECIMAL(12,2) DEFAULT 0.0
);

-- New table: Game rounds
CREATE TABLE game_rounds (
  game_id SERIAL PRIMARY KEY,
  crash_point DECIMAL(10, 2) NOT NULL,
  hash_seed VARCHAR(64),       -- The seed used to generate the crash point (revealed after game ends)
  hash_result VARCHAR(64),     -- The SHA-256 hash of the seed (revealed before game starts)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,        -- When betting was closed and game started
  completed_at TIMESTAMP,      -- When the game ended (crashed)
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'cancelled'
  revealed_seed VARCHAR(64)    -- The seed is revealed after the game completes
);

-- Modified bet_history table to include game_id
CREATE TABLE bet_history (
  bet_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  game_id INTEGER REFERENCES game_rounds(game_id), -- Reference to the game round
  bet_amount DECIMAL(10, 2) NOT NULL,
  multiplier DECIMAL(10, 2) NOT NULL, -- The multiplier at which the player cashed out (0 if they didn't)
  crash_point DECIMAL(10, 2) NOT NULL, -- The crash point of the game
  winnings DECIMAL(12, 2),            -- Amount won (0 if lost)
  cashout_trigger VARCHAR(20) CHECK (cashout_trigger IN ('manual', 'auto_multiplier', 'auto_amount', 'none', 'refunded')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_settings (
  setting_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  auto_cashout_multiplier DECIMAL(5, 2) DEFAULT 0,
  auto_cashout_amount DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  session_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Create index for performance
CREATE INDEX idx_bet_history_user_id ON bet_history(user_id);
CREATE INDEX idx_bet_history_game_id ON bet_history(game_id);
CREATE INDEX idx_game_rounds_status ON game_rounds(status);

-- Grant all privileges explicitly
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO stakeout_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO stakeout_user;

-- Create transactions table for wallet functionality
CREATE TABLE transactions (
  transaction_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'bet', 'win')),
  amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  reference_id VARCHAR(255), 
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Grant privileges to the application user
GRANT ALL PRIVILEGES ON TABLE transactions TO stakeout_user;
GRANT USAGE, SELECT ON SEQUENCE transactions_transaction_id_seq TO stakeout_user;