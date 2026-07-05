import { GoogleMap, LoadScript, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import { useState } from 'react';

const MapComponent = () => {
  const [response, setResponse] = useState(null);
  const [directions, setDirections] = useState(null);

  const mapStyles = {        
    height: "80vh",
    width: "100%"
  };
  
  const defaultCenter = {
    lat: 7.0731, lng: 125.6125 // Davao city center coordinates
  };
  
  const directionsCallback = (result, status) => {
    if (status === 'OK' && result) {
      setResponse(result);
    } else {
      console.error('Error fetching directions:', result);
    }
  };

  const handleCalculateRoute = () => {
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: { lat: 7.0731, lng: 125.6125 },
        destination: { lat: 7.075, lng: 125.610 },
        travelMode: 'DRIVING',
        waypoints: [
          { location: { lat: 7.0745, lng: 125.6115 } }, 
          { location: { lat: 7.0738, lng: 125.612 } }
        ],
        optimizeWaypoints: true,
      },
      directionsCallback
    );
  };

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <GoogleMap
        mapContainerStyle={mapStyles}
        zoom={14}
        center={defaultCenter}
      >
        {directions && (
          <DirectionsRenderer 
            directions={directions} 
          />
        )}
      </GoogleMap>
      <button onClick={handleCalculateRoute}>Optimize Route</button>
    </LoadScript>
  );
};

export default MapComponent;
