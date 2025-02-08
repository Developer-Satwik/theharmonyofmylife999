import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { sendPhoneVerificationCode, verifyPhoneCode } from "../../../firebase";
import "./Signup.css";
import { ButtonLoader } from "../../Loader/Loader";

function Signup({ onSignup }) {
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [popup, setPopup] = useState({ message: "", type: "", show: false });
  const [recaptchaToken, setRecaptchaToken] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    mobileNumber: "",
    password: "",
    confirmPassword: ""
  });

  const usernameRef = useRef(null);
  const mobileNumberRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const recaptchaRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Focus username input on component mount
    usernameRef.current?.focus();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear errors when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ""
      }));
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(prev => !prev);
  };

  const handleRecaptchaChange = (token) => {
    setRecaptchaToken(token);
    setFormErrors(prev => ({ ...prev, recaptcha: "" }));
  };

  const handleSendVerificationCode = async () => {
    if (!formData.mobileNumber || !/^\d{10}$/.test(formData.mobileNumber)) {
      setFormErrors(prev => ({
        ...prev,
        mobileNumber: "Please enter a valid 10-digit mobile number"
      }));
      return;
    }

    try {
      setIsLoading(true);
      const phoneNumber = `+91${formData.mobileNumber}`; // Add country code for India
      
      // Add a container for the reCAPTCHA if it doesn't exist
      if (!document.getElementById('phone-verify-recaptcha')) {
        const container = document.createElement('div');
        container.id = 'phone-verify-recaptcha';
        container.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 2147483647;
          background: white;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(container);
      }
      
      const confirmationResult = await sendPhoneVerificationCode(phoneNumber);
      if (confirmationResult) {
        setShowVerificationInput(true);
        showPopupMessage("Verification code sent! Please check your phone.", "success");
      }
    } catch (error) {
      console.error("Error sending verification code:", error);
      let errorMessage = "Failed to send verification code. Please try again.";
      
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = "Invalid phone number format. Please enter a valid number.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Too many attempts. Please try again later.";
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = "Phone authentication is not enabled. Please contact support.";
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Please check your connection and try again.";
      }
      
      showPopupMessage(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showPopupMessage("Please enter a valid 6-digit verification code", "error");
      return;
    }

    try {
      setIsLoading(true);
      const result = await verifyPhoneCode(verificationCode);
      if (result.user) {
        setIsPhoneVerified(true);
        showPopupMessage("Phone number verified successfully!", "success");
        setShowVerificationInput(false);
        
        // Clean up reCAPTCHA container
        const container = document.getElementById('phone-verify-recaptcha');
        if (container) {
          container.remove();
        }
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      showPopupMessage("Invalid verification code. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    const { username, mobileNumber, password, confirmPassword } = formData;

    if (!username || username.length < 3) {
      errors.username = "Username must be at least 3 characters";
    }

    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      errors.mobileNumber = "Please enter a valid 10-digit mobile number";
    }

    if (!password || password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const showPopupMessage = (message, type = "error") => {
    setPopup({ message, type, show: true });
    setTimeout(() => setPopup(prev => ({ ...prev, show: false })), 3000);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isPhoneVerified) {
      showPopupMessage("Please verify your phone number first");
      return;
    }

    if (!recaptchaToken) {
      showPopupMessage("Please complete the reCAPTCHA verification");
      return;
    }

    if (!validateForm()) {
      showPopupMessage("Please complete all fields correctly");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          mobileNumber: formData.mobileNumber,
          password: formData.password,
          recaptchaToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      if (data.token && data.user) {
        localStorage.setItem("userToken", data.token);
        localStorage.setItem("userRole", data.user.role);
        localStorage.setItem("userId", data.user._id);

        showPopupMessage("Registration successful!", "success");
        
        setTimeout(() => {
          onSignup(data.user, data.token);
          navigate("/");
        }, 1000);
      }
    } catch (error) {
      console.error("Registration error:", error);
      showPopupMessage(error.message || "Registration failed! Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Clean up reCAPTCHA verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          console.warn('Error clearing verifier on unmount:', e);
        }
        window.recaptchaVerifier = null;
      }
      
      // Remove container
      const recaptchaContainer = document.getElementById('recaptcha-container');
      if (recaptchaContainer) {
        recaptchaContainer.remove();
      }
    };
  }, []);

  return (
    <div className="signup-container">
      <form className="signup-form" onSubmit={handleSubmit}>
        <div className="signup-header">
          Create Account
          <span>Sign up to get started</span>
        </div>

        <div className="input__container">
          <input
            type="text"
            name="username"
            className={`input__field ${formErrors.username ? "error" : ""}`}
            placeholder="Enter your name"
            ref={usernameRef}
            value={formData.username}
            onChange={handleInputChange}
            required
            disabled={isLoading}
          />
          {formErrors.username && (
            <div className="error-text">{formErrors.username}</div>
          )}
        </div>

        <div className="input__container">
          <input
            type="tel"
            name="mobileNumber"
            className={`input__field ${formErrors.mobileNumber ? "error" : ""}`}
            placeholder="Enter your phone number"
            ref={mobileNumberRef}
            value={formData.mobileNumber}
            onChange={handleInputChange}
            required
            pattern="[0-9]{10}"
            maxLength="10"
            disabled={isLoading || isPhoneVerified}
          />
          {!isPhoneVerified && (
            <button
              type="button"
              className="verify-button"
              onClick={handleSendVerificationCode}
              disabled={isLoading || !formData.mobileNumber}
            >
              {isLoading ? <ButtonLoader /> : "Verify"}
            </button>
          )}
          {isPhoneVerified && (
            <span className="verified-badge">
              <i className="fas fa-check-circle"></i> Verified
            </span>
          )}
          {formErrors.mobileNumber && (
            <div className="error-text">{formErrors.mobileNumber}</div>
          )}
        </div>

        {showVerificationInput && !isPhoneVerified && (
          <div className="input__container">
            <input
              type="text"
              className="input__field"
              placeholder="Enter verification code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength="6"
              required
            />
            <button
              type="button"
              className="verify-button"
              onClick={handleVerifyCode}
              disabled={isLoading || !verificationCode}
            >
              {isLoading ? <ButtonLoader /> : "Submit"}
            </button>
          </div>
        )}

        <div className="input__container password-container">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            className={`input__field ${formErrors.password ? "error" : ""}`}
            placeholder="Create password"
            ref={passwordRef}
            value={formData.password}
            onChange={handleInputChange}
            required
            disabled={isLoading}
          />
          <i
            className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"} password-toggle-icon`}
            onClick={togglePasswordVisibility}
          />
          {formErrors.password && (
            <div className="error-text">{formErrors.password}</div>
          )}
        </div>

        <div className="input__container password-container">
          <input
            type={showConfirmPassword ? "text" : "password"}
            name="confirmPassword"
            className={`input__field ${formErrors.confirmPassword ? "error" : ""}`}
            placeholder="Confirm password"
            ref={confirmPasswordRef}
            value={formData.confirmPassword}
            onChange={handleInputChange}
            required
            disabled={isLoading}
          />
          <i
            className={`fas ${showConfirmPassword ? "fa-eye-slash" : "fa-eye"} password-toggle-icon`}
            onClick={toggleConfirmPasswordVisibility}
          />
          {formErrors.confirmPassword && (
            <div className="error-text">{formErrors.confirmPassword}</div>
          )}
        </div>

        <div className="recaptcha-container">
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
            onChange={handleRecaptchaChange}
            onExpired={() => {
              setRecaptchaToken(null);
              setFormErrors(prev => ({
                ...prev,
                recaptcha: "reCAPTCHA expired, please verify again"
              }));
            }}
          />
        </div>
        {formErrors.recaptcha && (
          <div className="error-text">{formErrors.recaptcha}</div>
        )}

        <button
          type="submit"
          className="signup-button"
          disabled={isLoading || !isPhoneVerified}
        >
          {isLoading ? <ButtonLoader /> : "Sign Up"}
        </button>

        <div className="signin-link">
          Already have an account?<Link to="/login">Sign in</Link>
        </div>

        {popup.show && (
          <div className={`popup ${popup.type} show`}>{popup.message}</div>
        )}
      </form>
    </div>
  );
}

export default Signup;