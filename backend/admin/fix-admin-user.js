import bcrypt from 'bcrypt';
import { sequelize } from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const fixAdminUser = async () => {
  try {
    console.log('Checking admin user...');
    
    // Check if admin user exists
    const result = await sequelize.query(
      "SELECT user_id, username, email, password_hash, role FROM users WHERE email = 'admin@battlearena.local'",
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (result.length === 0) {
      console.log('Admin user does not exist. Creating...');
      
      // Hash the password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash('admin123', saltRounds);
      
      // Create the admin user
      await sequelize.query(
        "INSERT INTO users (username, email, password_hash, role, account_status, balance) VALUES ('admin', 'admin@battlearena.local', $1, 'super_admin', 'active', 0.00)",
        {
          bind: [passwordHash],
          type: sequelize.QueryTypes.INSERT
        }
      );
      
      console.log('Admin user created successfully!');
    } else {
      console.log('Admin user exists. Checking password...');
      const user = result[0];
      
      // Check if password is correct
      const isValid = await bcrypt.compare('admin123', user.password_hash);
      
      if (!isValid) {
        console.log('Password is incorrect. Updating...');
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash('admin123', saltRounds);
        
        await sequelize.query(
          "UPDATE users SET password_hash = $1 WHERE email = 'admin@battlearena.local'",
          {
            bind: [passwordHash],
            type: sequelize.QueryTypes.UPDATE
          }
        );
        
        console.log('Admin password updated successfully!');
      } else {
        console.log('Admin user credentials are correct!');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing admin user:', error);
    process.exit(1);
  }
};

fixAdminUser();