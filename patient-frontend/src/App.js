import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import contractArtifact from './contractArtifact.json';
import './App.css'; 

// --- API Endpoints ---
const PATIENT_BACKEND_URL = 'http://localhost:5001';
const HOSPITAL_BACKEND_URL = 'http://localhost:5002';
const contractAddress = contractArtifact.address;
const contractABI = contractArtifact.abi;

// --- Helper Functions ---
let provider;
let signer;
let contract;

async function connectToMetamask() {
  if (window.ethereum) {
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []); 
      signer = await provider.getSigner();
      contract = new ethers.Contract(contractAddress, contractABI, signer);
      
      const walletAddress = await signer.getAddress();
      return { walletAddress, signer, contract };
    } catch (error) {
      console.error("Error connecting to MetaMask:", error);
      return null;
    }
  } else {
    alert('Please install MetaMask!');
    return null;
  }
}

function App() {
  // ... (State and Login functions are unchanged) ...
  const [walletAddress, setWalletAddress] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [message, setMessage] = useState('Please connect your MetaMask wallet.');
  const [view, setView] = useState('onboard'); // onboard, dashboard, settings

  const handlePatientLogin = async () => {
    const connection = await connectToMetamask();
    if (!connection) return;
    setMessage('Connecting to patient backend...');
    try {
      const res = await axios.post(`${PATIENT_BACKEND_URL}/api/auth/onboard`, {
        walletAddress: connection.walletAddress
      });
      setWalletAddress(connection.walletAddress);
      setPublicKey(res.data.rsaPublicKey); // We just store one for display
      setMessage(res.data.message);
      setView('dashboard'); 
    } catch (error) {
      console.error("Patient onboarding error:", error);
      setMessage('Patient onboarding failed. See console.');
    }
  };

  const handleHospitalLogin = async () => {
    const connection = await connectToMetamask();
    if (!connection) return;
    const hospitalName = prompt("Enter Hospital Name (e.g., CityCare):");
    if (!hospitalName) return;
    setMessage('Connecting to hospital backend...');
    try {
      const res = await axios.post(`${HOSPITAL_BACKEND_URL}/api/auth/onboard`, {
        walletAddress: connection.walletAddress,
        hospitalName: hospitalName
      });
      setWalletAddress(connection.walletAddress);
      setPublicKey(res.data.rsaPublicKey); // We just store one for display
      setMessage(res.data.message + " (Hospital View)");
      setView('dashboard'); 
    } catch (error) {
      console.error("Hospital onboarding error:", error);
      setMessage('Hospital onboarding failed. See console.');
    }
  };

  if (view === 'onboard') {
    return (
      <div className="App onboard-container">
        <h1>Secure Health Share</h1>
        <p>{message}</p>
        <button onClick={handlePatientLogin}>Patient Login</button>
        <button onClick={handleHospitalLogin} className="hospital-button">
          Hospital Registration (Test)
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Patient Dashboard</h1>
        <div className="wallet-info">
          <p><strong>Status:</strong> {message}</p>
          <p><strong>Wallet:</strong> {walletAddress}</p>
        </div>
        <nav>
          <button onClick={() => setView('dashboard')}>Dashboard</button>
          <button onClick={() => setView('settings')}>Settings</button>
        </nav>
      </header>
      
      <main>
        {view === 'dashboard' && <DashboardView patientWallet={walletAddress} />}
        {view === 'settings' && <SettingsView patientWallet={walletAddress} />}
      </main>
    </div>
  );
}

// --- Dashboard Component (UPDATED) ---
function DashboardView({ patientWallet }) {
  const [heartbeat, setHeartbeat] = useState('');
  const [steps, setSteps] = useState(''); // *** RENAMED from bp ***
  const [sugarLevel, setSugarLevel] = useState('');
  const [status, setStatus] = useState('Enter your data to submit.');

  const handleSubmitData = async (e) => {
    e.preventDefault();
    // *** UPDATED: Check for steps ***
    if (!heartbeat || !steps || !sugarLevel) {
      alert('Please fill in all three data points.');
      return;
    }
    
    setStatus('Encrypting and preparing data...');
    try {
      // *** UPDATED: Send 'steps' instead of 'bp' ***
      const res = await axios.post(`${PATIENT_BACKEND_URL}/api/data/upload`, {
        patientWallet,
        heartbeat,
        steps: steps, 
        sugarLevel
      });

      const { transactions } = res.data;
      if (transactions.length === 0) {
        setStatus('No hospitals have been granted permission. Please check Settings.');
        return;
      }
      setStatus(`Found ${transactions.length} hospitals. Please approve transactions...`);
      for (const txData of transactions) {
        if (!contract) {
          alert("Contract not connected. Please re-login.");
          return;
        }
        console.log(`[Submit] Calling commitData for hospital...`);
        const tx = await contract.commitData(txData.verifyIndex, txData.encNonce);
        setStatus(`Waiting for transaction for ${txData.hospitalWallet}...`);
        await tx.wait();
        console.log(`[Submit] Transaction successful for ${txData.hospitalWallet}`);
      }
      setStatus(`Successfully committed data for ${transactions.length} hospitals!`);
      setHeartbeat('');
      setSteps(''); // *** UPDATED: Clear steps ***
      setSugarLevel('');
    } catch (error) {
      console.error("Error submitting data:", error);
      setStatus('Data submission failed. See console.');
    }
  };

  return (
    <div className="view-container data-form">
      <h2>My Health Data</h2>
      <p>Submit new health records. All fields will be encrypted with Paillier.</p>
      
      <form onSubmit={handleSubmitData}>
        <div className="form-group">
          <label>Heartbeat (BPM)</label>
          <input 
            type="number" 
            value={heartbeat} 
            onChange={(e) => setHeartbeat(e.target.value)} 
            placeholder="e.g., 72"
          />
        </div>
        {/* *** UPDATED: Changed from BP to Steps *** */}
        <div className="form-group">
          <label>Steps</label>
          <input 
            type="number" 
            value={steps} 
            onChange={(e) => setSteps(e.target.value)} 
            placeholder="e.g., 8000"
          />
        </div>
        <div className="form-group">
          <label>Sugar Level (mg/dL)</label>
          <input 
            type="number" 
            value={sugarLevel} 
            onChange={(e) => setSugarLevel(e.target.value)} 
            placeholder="e.g., 90"
          />
        </div>
        
        <button type="submit" className="grant-button">Encrypt & Submit</button>
      </form>
      <p className="status-message">{status}</p>
    </div>
  );
}

// --- Settings Component (UPDATED) ---
function SettingsView({ patientWallet }) {
  const [hospitals, setHospitals] = useState([]);
  const [granted, setGranted] = useState(new Set());
  const [status, setStatus] = useState('Loading hospitals...');

  // Fetch hospital list (now gets both keys)
  useEffect(() => {
    async function fetchData() {
      try {
        const hospitalRes = await axios.get(`${HOSPITAL_BACKEND_URL}/api/auth/hospitals`);
        setHospitals(hospitalRes.data); // Data now includes both keys
        
        const grantedRes = await axios.get(`${PATIENT_BACKEND_URL}/api/permissions/${patientWallet}`);
        setGranted(new Set(grantedRes.data));
        
        setStatus('Hospitals loaded.');
      } catch (error) {
        console.error("Error fetching hospital data:", error);
        setStatus('Failed to load hospitals. See console.');
      }
    }
    fetchData();
  }, [patientWallet]);

  // Grant Button Click Handler (NOW SENDS BOTH KEYS)
  const handleGrant = async (hospital) => {
    setStatus(`Granting access to ${hospital.name}...`);
    try {
      // 1. Tell patient backend to generate and encrypt a symmetric key
      // *** NEW: Send both public keys to the backend ***
      const grantRes = await axios.post(`${PATIENT_BACKEND_URL}/api/permissions/grant`, {
        patientWallet: patientWallet,
        hospitalWallet: hospital.walletAddress,
        rsaPublicKey: hospital.rsaPublicKey,
        paillierPublicKey: hospital.paillierPublicKey
      });

      const { encryptedSymKey } = grantRes.data;
      
      // 2. Call the smart contract function (unchanged)
      if (!contract) {
        alert("Contract not connected. Please re-login.");
        return;
      }
      const tx = await contract.registerSymKey(hospital.walletAddress, encryptedSymKey);
      setStatus('Waiting for transaction confirmation...');
      await tx.wait(); 

      // 3. Update UI
      setGranted(prev => new Set(prev).add(hospital.walletAddress));
      setStatus(`Successfully granted access to ${hospital.name}!`);

    } catch (error) {
      console.error("Error granting access:", error);
      setStatus(`Failed to grant access to ${hospital.name}. See console.`);
    }
  };
  
  // Revoke Button Click Handler (Unchanged)
  const handleRevoke = async (hospital) => {
    setStatus(`Revoking access from ${hospital.name}...`);
    try {
      const tx = await contract.revokeAccess(hospital.walletAddress);
      setStatus('Waiting for transaction confirmation...');
      await tx.wait(); 
      await axios.post(`${PATIENT_BACKEND_URL}/api/permissions/revoke`, {
        patientWallet: patientWallet,
        hospitalWallet: hospital.walletAddress
      });
      setGranted(prev => {
        const newGranted = new Set(prev);
        newGranted.delete(hospital.walletAddress);
        return newGranted;
      });
      setStatus(`Successfully revoked access from ${hospital.name}!`);
    } catch (error) {
      console.error("Error revoking access:", error);
      setStatus(`Failed to revoke access from ${hospital.name}. See console.`);
    }
  };

  return (
    <div className="view-container">
      <h2>Hospital Permissions</h2>
      <p>{status}</p>
      <table>
        <thead>
          <tr>
            <th>Hospital Name</th>
            <th>Wallet Address</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {/* This mapping now works because `hospital` object contains all keys */}
          {hospitals.map((hospital) => (
            <tr key={hospital.walletAddress}>
              <td>{hospital.name}</td>
              <td>{hospital.walletAddress}</td>
              <td>
                {granted.has(hospital.walletAddress) ? (
                  <button className="revoke-button" onClick={() => handleRevoke(hospital)}>
                    Revoke
                  </button>
                ) : (
                  <button className="grant-button" onClick={() => handleGrant(hospital)}>
                    Grant
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;