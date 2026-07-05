import React from 'react';
import PropTypes from 'prop-types';
import styles from './Badge.module.css'; // Import your CSS module for styling

const Badge = ({ text, color, className }) => {
  return (
    <span className={`${styles.badge} ${className}`} style={{ backgroundColor: color }}>
      {text}
    </span>
  );
};

Badge.propTypes = {
  text: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  className: PropTypes.string,
};

Badge.defaultProps = {
  className: '',
};

export default Badge; 