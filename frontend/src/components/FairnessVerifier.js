import React, { useState } from 'react';
import crypto from 'crypto-js';

const FairnessVerifier = () => {
  const [seed, setSeed] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [expectedCrashPoint, setExpectedCrashPoint] = useState('');
  const [calculatedHash, setCalculatedHash] = useState('');
  const [calculatedCrashPoint, setCalculatedCrashPoint] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');
  
  const verifyFairness = () => {
    try {
      // Reset state
      setError('');
      setCalculatedHash('');
      setCalculatedCrashPoint('');
      setIsVerified(false);
      
      if (!seed || !expectedHash || !expectedCrashPoint) {
        setError('Please fill in all fields');
        return;
      }
      
      // Calculate SHA-256 hash of the seed
      const hash = crypto.SHA256(seed).toString();
      setCalculatedHash(hash);
      
      // Check if hashes match
      const hashesMatch = hash === expectedHash;
      
      if (!hashesMatch) {
        setError('Hash verification failed. The seed does not match the expected hash.');
        return;
      }
      
      // Convert first 8 chars of hash to a number between 0 and 1
      const hashHex = hash.substring(0, 8);
      const hashInt = parseInt(hashHex, 16);
      const hashFloat = hashInt / 0xffffffff;
      
      // Apply the house edge (1%) and calculate the crash point
      // Formula: 99 / (1 - R) where R is the random value between 0-1
      const houseEdgeModifier = 0.99; // 1% house edge
      const e = Math.floor(100 * houseEdgeModifier / (1 - hashFloat));
      
      // Limit the maximum crash point (optional)
      const maxCrashPoint = 1000.00;
      const crashPoint = Math.min(e / 100, maxCrashPoint).toFixed(2);
      
      setCalculatedCrashPoint(crashPoint);
      
      // Check if crash points match
      const crashPointsMatch = parseFloat(crashPoint) === parseFloat(expectedCrashPoint);
      setIsVerified(crashPointsMatch);
      
      if (!crashPointsMatch) {
        setError('Crash point verification failed. The calculated crash point does not match the expected crash point.');
      }
    } catch (error) {
      setError('Verification error: ' + error.message);
    }
  };
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-4">Verify Game Fairness</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Game Seed (revealed after crash)</label>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="e.g. a1b2c3d4e5f6..."
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
          />
        </div>
        
        <div>
          <label className="block text-sm mb-1">Expected Hash (shown before game)</label>
          <input
            type="text"
            value={expectedHash}
            onChange={(e) => setExpectedHash(e.target.value)}
            placeholder="SHA-256 hash value"
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
          />
        </div>
        
        <div>
          <label className="block text-sm mb-1">Expected Crash Point</label>
          <input
            type="text"
            value={expectedCrashPoint}
            onChange={(e) => setExpectedCrashPoint(e.target.value)}
            placeholder="e.g. 2.35"
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
          />
        </div>
        
        <button
          onClick={verifyFairness}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium"
        >
          Verify Fairness
        </button>
        
        {error && (
          <div className="p-3 bg-red-800 bg-opacity-50 rounded text-red-200">
            {error}
          </div>
        )}
        
        {calculatedHash && (
          <div className="mt-4 p-4 bg-gray-700 rounded">
            <h3 className="font-bold mb-2">Verification Results:</h3>
            
            <div className="text-sm mb-1">
              <span className="font-semibold">Calculated Hash:</span>{' '}
              <span className="font-mono">{calculatedHash}</span>
            </div>
            
            {calculatedCrashPoint && (
              <div className="text-sm mb-1">
                <span className="font-semibold">Calculated Crash Point:</span>{' '}
                <span className="font-mono">{calculatedCrashPoint}x</span>
              </div>
            )}
            
            <div className="mt-3 text-center">
              {isVerified ? (
                <div className="text-green-400 font-bold">✓ Verified - The game was fair!</div>
              ) : (
                <div className="text-red-400 font-bold">✗ Verification failed</div>
              )}
            </div>
          </div>
        )}
        
        <div className="text-xs text-gray-400 mt-4">
          <p className="mb-1">
            <span className="font-semibold">How provable fairness works:</span> Before each game, the server generates a random seed and calculates its SHA-256 hash. The hash is shown to players before the game starts (but not the seed). The seed determines the crash point.
          </p>
          <p>
            After the game ends, the server reveals the original seed. You can verify that the seed matches the hash shown earlier, and that it produces the correct crash point.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FairnessVerifier;