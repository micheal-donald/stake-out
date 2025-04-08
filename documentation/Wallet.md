# Wallet Module Documentation

The Wallet module provides functionality for users to manage their funds, including depositing and withdrawing money, as well as viewing their transaction history.

## Features

- View current balance
- Deposit funds
- Withdraw funds (with balance validation)
- View transaction history
- Pagination for transaction history

## Technical Implementation

### Backend

The wallet functionality is implemented as a separate module with dedicated routes:

- `GET /api/wallet/balance` - Get the user's current balance
- `POST /api/wallet/deposit` - Add funds to the user's account
- `POST /api/wallet/withdraw` - Withdraw funds from the user's account
- `GET /api/wallet/transactions` - Get the user's transaction history

All routes are protected with JWT authentication.

### Database

The module relies on two database tables:

1. The existing `users` table, which contains the `balance` field
2. A new `transactions` table, which tracks all financial operations:

```sql
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
```

### Frontend

The wallet UI is implemented as a standalone React component (`WalletComponent.jsx`) that communicates with the backend API. The component includes:

- Balance display
- Tab interface for deposit and withdrawal
- Form validation
- Transaction history with pagination
- Loading states and error handling

## Future Enhancements

1. **Payment Processing Integration**: Currently, deposits and withdrawals are simulated. In a production environment, these would be integrated with payment processors.

2. **Transaction Receipts**: Add functionality to generate and download transaction receipts.

3. **Transaction Filtering**: Allow users to filter their transaction history by type, date, amount, etc.

4. **Deposit Limits**: Implement daily/weekly/monthly deposit limits for responsible gaming.

5. **Two-Factor Authentication**: Add 2FA for high-value transactions.

## How to Run Migrations

To create the necessary database tables, run:

```bash
node database/run-migration.js
```

This script will create the `transactions` table if it doesn't already exist.

## Integration with Other Modules

The wallet module integrates with other parts of the application:

- **User Authentication**: All wallet operations require authentication
- **Betting System**: When a user places a bet, the system checks their balance
- **Profile**: The user's balance is displayed in the profile and navbar