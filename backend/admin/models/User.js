import { DataTypes, Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create sequelize instance with correct database URL
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://stakeout_user:securepassword@localhost:5432/stakeoutbet_db', {
  dialect: 'postgres',
  logging: false,
});

const User = sequelize.define('users', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('user', 'moderator', 'admin', 'super_admin'),
    defaultValue: 'user'
  },
  balance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'users',
  timestamps: false
});

export { sequelize };
export default User;