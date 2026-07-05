export const handleFirebaseError = (error) => {
  console.error('Firebase Error:', {
    code: error.code,
    message: error.message,
    stack: error.stack
  });

  // Map Firebase error codes to user-friendly messages
  const errorMessages = {
    'auth/user-not-found': 'Invalid email or password',
    'auth/wrong-password': 'Invalid email or password',
    'auth/invalid-email': 'Invalid email format',
    'auth/user-disabled': 'This account has been disabled',
    'auth/email-already-in-use': 'This email is already registered',
    'auth/operation-not-allowed': 'Operation not allowed',
    'auth/weak-password': 'Password is too weak',
    'auth/invalid-credential': 'Invalid credentials',
    'auth/network-request-failed': 'Network error. Please check your connection',
    'permission-denied': 'You do not have permission to perform this action',
    'not-found': 'The requested resource was not found',
    'already-exists': 'The resource already exists'
  };

  return {
    message: errorMessages[error.code] || error.message,
    code: error.code,
    original: error
  };
}; 