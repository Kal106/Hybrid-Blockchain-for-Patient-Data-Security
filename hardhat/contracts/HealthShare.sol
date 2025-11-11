// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";

/**
 * @title HealthShare
 * @dev Manages permissions and data integrity proofs for health records.
 */
contract HealthShare {

    // --- Events ---
    
    // Emitted when a patient grants a symmetric key to a hospital
    event KeyGranted(
        address indexed patient,
        address indexed hospital,
        string encryptedSymKey
    );

    // Emitted when a patient revokes access from a hospital
    event AccessRevoked(
        address indexed patient,
        address indexed hospital
    );

    // Emitted when a patient commits new data
    event DataCommitted(
        address indexed patient,
        string verifyIndex,
        string encryptedNonce
    );

    // --- Storage ---
    
    // Mapping: patientAddress => hospitalAddress => encryptedSymmetricKey
    mapping(address => mapping(address => string)) public encryptedSymKeys;

    // Mapping: patientAddress => verifyIndex => encryptedNonce
    mapping(address => mapping(string => string)) public dataCommits;


    // --- Functions ---
    
    /**
     * @dev Called by a patient to grant a hospital access.
     * Stores the symmetric key, encrypted with the hospital's public key.
     * @param _hospital The wallet address of the hospital being granted access.
     * @param _encryptedSymKey The symmetric key, encrypted by the patient backend.
     */
    function registerSymKey(address _hospital, string calldata _encryptedSymKey) external {
        address patient = msg.sender;
        
        console.log("Patient %s is granting access to Hospital %s", patient, _hospital);

        // Store the encrypted key on-chain
        encryptedSymKeys[patient][_hospital] = _encryptedSymKey;

        // Emit the event for the hospital listener to catch
        emit KeyGranted(patient, _hospital, _encryptedSymKey);
    }

    // --- TODO: Implement in next steps ---
    
    function commitData(string calldata _verifyIndex, string calldata _encNonce) external {
        address patient = msg.sender;
        
        // Store the integrity proof on-chain
        // We use the verifyIndex as the key for this patient's commits
        dataCommits[patient][_verifyIndex] = _encNonce;

        // Emit the event for the hospital listener to catch
        emit DataCommitted(patient, _verifyIndex, _encNonce);
    }

    function revokeAccess(address _hospital) external {
        address patient = msg.sender;
        console.log("Patient %s is REVOKING access for Hospital %s", patient, _hospital);

        // Delete the key from storage [cite: 68]
        delete encryptedSymKeys[patient][_hospital];

        // Emit the event for the hospital listener to catch [cite: 68]
        emit AccessRevoked(patient, _hospital);
    }

    constructor() {
        console.log("HealthShare contract deployed.");
    }
}