// import node module libraries
import { Fragment, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import dynamic from 'next/dynamic'

// Improved dynamic import with better error handling for Turbopack
const Chart = dynamic(
	() => import('react-apexcharts').catch((err) => {
		console.warn('Failed to load react-apexcharts:', err);
		// Return a placeholder component that won't break the page
		return {
			default: () => (
				<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
					Chart unavailable
				</div>
			)
		};
	}),
	{ 
		ssr: false,
		loading: () => <div style={{ padding: '20px', textAlign: 'center' }}>Loading chart...</div>
	}
);

const ApexCharts = ({ options, series, width, type = 'line', height }) => {
	const [windowDefined, setWindowDefined] = useState(false)
	const [hasError, setHasError] = useState(false)
	
	useEffect(() => {
		if (typeof window !== 'undefined') {
			setWindowDefined(true)
		}
	}, [])
	
	// Error boundary for chart loading - catch chunk loading errors
	useEffect(() => {
		const handleError = (event) => {
			// Catch chunk loading errors
			if (event.message && (
				event.message.includes('apexcharts') || 
				event.message.includes('chunk') ||
				event.filename?.includes('apexcharts')
			)) {
				console.warn('ApexCharts chunk loading error (non-critical):', event);
				setHasError(true);
				// Prevent error from bubbling up
				event.preventDefault();
				return true;
			}
		};
		
		const handleUnhandledRejection = (event) => {
			if (event.reason && (
				event.reason.message?.includes('apexcharts') ||
				event.reason.message?.includes('chunk')
			)) {
				console.warn('ApexCharts promise rejection (non-critical):', event.reason);
				setHasError(true);
				event.preventDefault();
			}
		};
		
		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handleUnhandledRejection);
		return () => {
			window.removeEventListener('error', handleError);
			window.removeEventListener('unhandledrejection', handleUnhandledRejection);
		};
	}, []);
	
	if (hasError) {
		return (
			<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
				Chart unavailable. Please refresh the page.
			</div>
		);
	}
	
	if (!windowDefined) {
		return null;
	}
	
	try {
		return (
			<Fragment>
				<Chart 
					options={options} 
					series={series} 
					type={type} 
					width={width} 
					height={height}
				/>
			</Fragment>
		);
	} catch (error) {
		console.warn('ApexCharts render error:', error);
		return (
			<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
				Chart unavailable. Please refresh the page.
			</div>
		);
	}
};

// ** PropTypes
ApexCharts.propTypes = {
	options: PropTypes.object.isRequired,
	series: PropTypes.array.isRequired,
	type: PropTypes.string,
	width: PropTypes.number,
	height: PropTypes.number
};

export default ApexCharts;
