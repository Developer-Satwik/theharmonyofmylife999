import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./Login.css";
import { ButtonLoader } from "../../Loader/Loader";

function Login({ onLogin }) {
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [popup, setPopup] = useState({ message: "", type: "", show: false });
  const [showPassword, setShowPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState(null);
  const mobileNumberRef = useRef(null);
  const passwordRef = useRef(null);
  const recaptchaRef = useRef(null);
  const navigate = useNavigate();

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const handleRecaptchaChange = (token) => {
    setRecaptchaToken(token);
    setFormErrors((prev) => ({ ...prev, recaptcha: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    const mobileNumber = mobileNumberRef.current.value;
    const password = passwordRef.current.value;

    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      errors.mobileNumber = "Enter a valid 10-digit mobile number";
    }

    if (!password || password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!recaptchaToken) {
      errors.recaptcha = "Please complete the reCAPTCHA verification";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          mobileNumber: mobileNumberRef.current.value,
          password: passwordRef.current.value,
          recaptchaToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      
      if (data.token && data.user) {
        onLogin(data.user, data.token);
        navigate('/');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Login error:', error);
      setPopup({ message: error.message || 'Failed to login. Please try again.', type: 'error', show: true });
      setTimeout(() => setPopup((prev) => ({ ...prev, show: false })), 3000);
      // Reset reCAPTCHA on error
      recaptchaRef.current.reset();
      setRecaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="title">
          Welcome Back
          <br />
          <span>Sign in to continue</span>
        </div>

        <div className="input__container">
          <input
            type="tel"
            name="mobileNumber"
            className={`input__field ${formErrors.mobileNumber ? "error" : ""}`}
            placeholder="Phone Number"
            ref={mobileNumberRef}
            required
            pattern="[0-9]{10}"
            maxLength="10"
            disabled={isLoading}
          />
          {formErrors.mobileNumber && (
            <div className="error-text">{formErrors.mobileNumber}</div>
          )}
        </div>

        <div className="input__container password-container">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            className={`input__field ${formErrors.password ? "error" : ""}`}
            placeholder="Password"
            ref={passwordRef}
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

        <div className="recaptcha-container">
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
            onChange={handleRecaptchaChange}
            onExpired={() => {
              setRecaptchaToken(null);
              setFormErrors((prev) => ({
                ...prev,
                recaptcha: "reCAPTCHA expired, please verify again"
              }));
            }}
            onError={() => {
              setRecaptchaToken(null);
              setFormErrors((prev) => ({
                ...prev,
                recaptcha: "reCAPTCHA error, please try again"
              }));
            }}
          />
          {formErrors.recaptcha && (
            <div className="error-text">{formErrors.recaptcha}</div>
          )}
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={isLoading || !recaptchaToken}
        >
          {isLoading ? <ButtonLoader /> : "Login"}
        </button>

        <div className="alternate-action">
          Don't have an account? <a href="/signup">Sign up</a>
        </div>

        {popup.show && (
          <div className={`popup ${popup.type} show`}>{popup.message}</div>
        )}
      </form>
    </div>
  );
}

export default Login;