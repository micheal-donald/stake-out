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

CREATE TABLE bet_history (
  bet_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  bet_amount DECIMAL(10, 2) NOT NULL,
  multiplier DECIMAL(5, 2) NOT NULL,
  crash_point DECIMAL(5, 2) NOT NULL,
  winnings DECIMAL(12, 2),
  cashout_trigger VARCHAR(20) CHECK (cashout_trigger IN ('manual', 'auto_multiplier', 'auto_amount')),
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

-- Grant all privileges explicitly
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO stakeout_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO stakeout_user;
