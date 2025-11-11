import React, { useState } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import './App.css'; 

// --- API Endpoint ---
const HOSPITAL_BACKEND_URL = 'http://localhost:5002';

async function connectToMetamask() {
  if (window.ethereum) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      return { walletAddress };
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
  const [walletAddress, setWalletAddress] = useState(null);
  const [message, setMessage] = useState('Please connect your MetaMask wallet to register.');
  const [isRegistered, setIsRegistered] = useState(false);
  const [patientData, setPatientData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleHospitalLogin = async () => {
    // ... (This function is correct and unchanged) ...
    const connection = await connectToMetamask();
    if (!connection) return;

    const hospitalName = prompt("Enter your Hospital Name (e.g., CityCare):");
    if (!hospitalName) {
      setMessage('Registration cancelled. Hospital name is required.');
      return;
    }
    setMessage(`Registering ${hospitalName}...`);
    try {
      const res = await axios.post(`${HOSPITAL_BACKEND_URL}/api/auth/onboard`, {
        walletAddress: connection.walletAddress,
        hospitalName: hospitalName
      });
      setWalletAddress(connection.walletAddress);
      setMessage(res.data.message);
      setIsRegistered(true);
    } catch (error) {
      console.error("Hospital onboarding error:", error);
      setMessage('Hospital onboarding failed. See console.');
    }
  };

  const fetchPatientData = async () => {
    setIsLoading(true);
    setMessage('Fetching and computing all patient data...');
    setPatientData([]); // Clear old data
    try {
      const res = await axios.get(`${HOSPITAL_BACKEND_URL}/api/compute/all-patient-averages`);
      
      // *** NEW: Check if the response is an array (data) or an object (message) ***
      if (Array.isArray(res.data)) {
        setPatientData(res.data);
        setMessage(res.data.length > 0 ? 'Computation successful.' : 'No patient data found in local ledger.');
      } else if (res.data && res.data.message) {
        // This handles our new graceful messages
        setPatientData([]);
        setMessage(res.data.message);
      } else {
        setPatientData([]);
        setMessage('Received an unexpected response from the server.');
      }
    } catch (error) {
      console.error("Error fetching patient data:", error);
      setMessage('Failed to compute data. See console.');
    }
    setIsLoading(false);
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>Hospital Dashboard</h1>
        <p>{message}</p>
      </header>
      
      {!isRegistered ? (
        <div className="onboard-container">
          <button onClick={handleHospitalLogin}>
            Login / Register with MetaMask
          </button>
        </div>
      ) : (
        <div className="dashboard-container">
          <div className="wallet-info">
            <p><strong>Registered Hospital Wallet:</strong> {walletAddress}</p>
          </div>
          <button onClick={fetchPatientData} disabled={isLoading}>
            {isLoading ? 'Computing...' : "Check Patient's Data Status"}
          </button>
          
          <PatientDataTable data={patientData} />
        </div>
      )}
    </div>
  );
}

// *** UPDATED: Changed table header and data cell ***
function PatientDataTable({ data }) {
  if (!data || data.length === 0) {
    return null; 
  }
  
  return (
    <table>
      <thead>
        <tr>
          <th>Patient Wallet</th>
          <th>Avg Heartbeat (BPM)</th>
          <th>Avg Steps</th>
          <th>Avg Sugar Level (mg/dL)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((patient) => (
          <tr key={patient.patientWallet}>
            <td>{patient.patientWallet}</td>
            <td>{patient.avgHeartbeat}</td>
            <td>{patient.avgSteps}</td> {/* Changed from avgBp */}
            <td>{patient.avgSugarLevel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
} 

export default App;