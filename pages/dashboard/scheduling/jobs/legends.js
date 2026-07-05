import React from 'react';
import { Card, Button, ListGroup, Dropdown, OverlayTrigger, Tooltip, Badge } from 'react-bootstrap';
import { ThreeDotsVertical, PlusCircle, Star, StarFill } from 'react-bootstrap-icons';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Legend = ({ 
    legendItems, 
    defaultStatus, 
    onAddLegend, 
    onEditLegend, 
    onDeleteLegend, 
    onSetDefault 
  }) => {

    const handleAddLegend = () => {
      onAddLegend();
     
    };

    const handleEditLegend = (item) => {
      onEditLegend(item);
      
    };

    const handleDeleteLegend = (id) => {
      onDeleteLegend(id);
     
    };

    const handleSetDefault = (id) => {
      onSetDefault(id);
     
    };

    return (
      <>
        <ToastContainer 
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />

        <Card className="shadow-sm d-flex flex-column" style={{ height: '720px', width: '100%' }}>
        <Card.Header 
  className="bg-white py-3 px-4"
  style={{ borderBottom: '1px solid #e9ecef' }}
>
  <div className="d-flex flex-column gap-3">
    <h5 
      className="mb-0" 
      style={{ 
        fontSize: '16px',
        fontWeight: 500,
        color: '#0088cc' 
      }}
    >
    Legends
    </h5>
    <Button 
      variant="outline"
      size="sm" 
      className="d-flex align-items-center gap-2 w-100"
      style={{
        border: '1px solid #0088cc',
        color: '#0088cc',
        padding: '6px 12px',
        borderRadius: '4px',
        backgroundColor: 'transparent',
        fontSize: '14px',
        fontWeight: 400,
        transition: 'all 0.2s ease'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = '#f8f9fa';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      onClick={handleAddLegend}
    >
      <PlusCircle size={14} />
      Add Legends
    </Button>
  </div>
</Card.Header>
        
          <div className="legend-scroll flex-grow-1" style={{ overflowY: 'auto' }}>
            <ListGroup variant="flush">
              {legendItems?.map((item) => (
                <ListGroup.Item 
                  key={item.id}
                  className="py-3 px-3 hover-bg-light"
                  style={{ 
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between">
                    <OverlayTrigger
                      placement="left"
                      overlay={
                        <Tooltip>
                          <div className="text-start">
                            <div style={{ color: item.color }}>■</div>
                            <strong>{item.status}</strong>
                          </div>
                        </Tooltip>
                      }
                    >
                      <div 
                        className="d-flex align-items-center gap-3 flex-grow-1"
                        onClick={() => handleEditLegend(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div 
                          className="rounded"
                          style={{
                            width: "24px",
                            height: "24px",
                            backgroundColor: item.color,
                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            border: "2px solid rgba(0,0,0,0.1)"
                          }}
                        />
                        <div className="d-flex align-items-center gap-2">
                          <span 
                            className="status-text"
                            style={{
                              fontSize: '0.95rem',
                              fontWeight: 500,
                              color: '#2c3e50',
                              letterSpacing: '0.2px'
                            }}
                          >
                            {item.status}
                          </span>
                          {defaultStatus === item.id && (
                            <Badge 
                              bg="info" 
                              pill 
                              className="default-badge"
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.25em 0.75em',
                                fontWeight: 500,
                                backgroundColor: '#17a2b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                opacity: 0.9
                              }}
                            >
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                    </OverlayTrigger>

                    <Dropdown align="end">
                      <Dropdown.Toggle 
                        as="div"
                        className="btn btn-link p-1 text-muted"
                        style={{ cursor: 'pointer' }}
                      >
                        <ThreeDotsVertical />
                      </Dropdown.Toggle>

                      <Dropdown.Menu className="shadow-sm border-0">
                        <Dropdown.Item 
                          onClick={() => handleEditLegend(item)}
                          className="d-flex align-items-center gap-2"
                        >
                          <i className="bi bi-pencil" />
                          Edit Status
                        </Dropdown.Item>
                        
                        <Dropdown.Item 
                          onClick={() => handleSetDefault(item.id)}
                          className="d-flex align-items-center gap-2 justify-content-between"
                        >
                          <div className="d-flex align-items-center gap-2">
                            {defaultStatus === item.id ? 
                              <StarFill className="text-warning" /> : 
                              <Star />
                            }
                            Set as Default
                          </div>
                          {defaultStatus === item.id && (
                            <i className="bi bi-check2 text-success" />
                          )}
                        </Dropdown.Item>
                        
                        <Dropdown.Divider />
                        
                        <Dropdown.Item 
                          onClick={() => handleDeleteLegend(item.id)}
                          className="text-danger d-flex align-items-center gap-2"
                        >
                          <i className="bi bi-trash" />
                          Delete Status
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
          
          {legendItems?.length === 0 && (
            <Card.Body className="text-center py-4 text-muted">
              <p className="mb-0">No status items added yet</p>
            </Card.Body>
          )}

          <style jsx>{`
             .btn:hover {
              background-color: #f8f9fa !important;
              border-color: #0088cc !important;
              color: #0088cc !important;
            }

            .hover-bg-light:hover {
              background-color: #f8f9fa;
            }
            .transition-all {
              transition: all 0.2s ease;
            }
            .legend-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .legend-scroll::-webkit-scrollbar-track {
              background: #f1f1f1;
            }
            .legend-scroll::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 3px;
            }
            .legend-scroll::-webkit-scrollbar-thumb:hover {
              background: #555;
            }
            .status-text:hover {
              color: #1a252f;
            }
            .default-badge {
              transition: all 0.2s ease;
            }
            .default-badge:hover {
              opacity: 1;
            }
          `}</style>
        </Card>
      </>
    );
};

export default Legend;

// import React from 'react';
// import { Card, Button, ListGroup, Dropdown, OverlayTrigger, Tooltip, Badge } from 'react-bootstrap';
// import { ThreeDotsVertical, PlusCircle, Star, StarFill } from 'react-bootstrap-icons';

// const Legend = ({ 
//     legendItems, 
//     defaultStatus, 
//     onAddLegend, 
//     onEditLegend, 
//     onDeleteLegend, 
//     onSetDefault 
//   }) => {
//     return (
//         <Card className="shadow-sm d-flex flex-column" style={{ height: '730px' }}>
//         <Card.Header 
//           className="bg-white d-flex justify-content-between align-items-center py-3 px-4"
//           style={{ borderBottom: '1px solid #e9ecef' }}
//         >
//           <h5 
//             className="mb-0" 
//             style={{ 
//               fontSize: '16px',
//               fontWeight: 500,
//               color: '#0088cc' 
//             }}
//           >
//             Status Legend
//           </h5>
//           <Button 
//             variant="outline"
//             size="sm" 
//             className="d-flex align-items-center gap-2"
//             style={{
//               border: '1px solid #0088cc',
//               color: '#0088cc',
//               padding: '6px 12px',
//               borderRadius: '4px',
//               backgroundColor: 'transparent',
//               fontSize: '14px',
//               fontWeight: 400,
//               transition: 'all 0.2s ease'
//             }}
//             onMouseOver={(e) => {
//               e.currentTarget.style.backgroundColor = '#f8f9fa';
//             }}
//             onMouseOut={(e) => {
//               e.currentTarget.style.backgroundColor = 'transparent';
//             }}
//             onClick={onAddLegend}
//           >
//             <PlusCircle size={14} />
//             Add Status
//           </Button>
//         </Card.Header>
      
//       <div className="legend-scroll flex-grow-1" style={{ overflowY: 'auto' }}>
//         <ListGroup variant="flush">
//           {legendItems?.map((item) => (
//             <ListGroup.Item 
//               key={item.id}
//               className="py-3 px-3 hover-bg-light"
//               style={{ 
//                 transition: 'all 0.2s ease',
//                 cursor: 'pointer',
//               }}
//             >
//               <div className="d-flex align-items-center justify-content-between">
//                 <OverlayTrigger
//                   placement="left"
//                   overlay={
//                     <Tooltip>
//                       <div className="text-start">
//                         <div style={{ color: item.color }}>■</div>
//                         <strong>{item.status}</strong>
//                       </div>
//                     </Tooltip>
//                   }
//                 >
//                   <div 
//                     className="d-flex align-items-center gap-3 flex-grow-1"
//                     onClick={() => onEditLegend(item)}
//                     style={{ cursor: 'pointer' }}
//                   >
//                     <div 
//                       className="rounded"
//                       style={{
//                         width: "24px",
//                         height: "24px",
//                         backgroundColor: item.color,
//                         boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
//                         border: "2px solid rgba(0,0,0,0.1)"
//                       }}
//                     />
//                     <div className="d-flex align-items-center gap-2">
//                       <span 
//                         className="status-text"
//                         style={{
//                           fontSize: '0.95rem',
//                           fontWeight: 500,
//                           color: '#2c3e50',
//                           letterSpacing: '0.2px'
//                         }}
//                       >
//                         {item.status}
//                       </span>
//                       {defaultStatus === item.id && (
//                         <Badge 
//                           bg="info" 
//                           pill 
//                           className="default-badge"
//                           style={{
//                             fontSize: '0.7rem',
//                             padding: '0.25em 0.75em',
//                             fontWeight: 500,
//                             backgroundColor: '#17a2b8',
//                             textTransform: 'uppercase',
//                             letterSpacing: '0.5px',
//                             opacity: 0.9
//                           }}
//                         >
//                           Default
//                         </Badge>
//                       )}
//                     </div>
//                   </div>
//                 </OverlayTrigger>

//                 <Dropdown align="end">
//                   <Dropdown.Toggle 
//                     as="div"
//                     className="btn btn-link p-1 text-muted"
//                     style={{ cursor: 'pointer' }}
//                   >
//                     <ThreeDotsVertical />
//                   </Dropdown.Toggle>

//                   <Dropdown.Menu className="shadow-sm border-0">
//                     <Dropdown.Item 
//                       onClick={() => onEditLegend(item)}
//                       className="d-flex align-items-center gap-2"
//                     >
//                       <i className="bi bi-pencil" />
//                       Edit Status
//                     </Dropdown.Item>
                    
//                     <Dropdown.Item 
//                       onClick={() => onSetDefault(item.id)}
//                       className="d-flex align-items-center gap-2 justify-content-between"
//                     >
//                       <div className="d-flex align-items-center gap-2">
//                         {defaultStatus === item.id ? 
//                           <StarFill className="text-warning" /> : 
//                           <Star />
//                         }
//                         Set as Default
//                       </div>
//                       {defaultStatus === item.id && (
//                         <i className="bi bi-check2 text-success" />
//                       )}
//                     </Dropdown.Item>
                    
//                     <Dropdown.Divider />
                    
//                     <Dropdown.Item 
//                       onClick={() => onDeleteLegend(item.id)}
//                       className="text-danger d-flex align-items-center gap-2"
//                     >
//                       <i className="bi bi-trash" />
//                       Delete Status
//                     </Dropdown.Item>
//                   </Dropdown.Menu>
//                 </Dropdown>
//               </div>
//             </ListGroup.Item>
//           ))}
//         </ListGroup>
//       </div>
      
//       {legendItems?.length === 0 && (
//         <Card.Body className="text-center py-4 text-muted">
//           <p className="mb-0">No status items added yet</p>
//         </Card.Body>
//       )}

//       <style jsx>{`
//          .btn:hover {
//           background-color: #f8f9fa !important;
//           border-color: #0088cc !important;
//           color: #0088cc !important;
//         }

//         .hover-bg-light:hover {
//           background-color: #f8f9fa;
//         }
//         .transition-all {
//           transition: all 0.2s ease;
//         }
//         .legend-scroll::-webkit-scrollbar {
//           width: 6px;
//         }
//         .legend-scroll::-webkit-scrollbar-track {
//           background: #f1f1f1;
//         }
//         .legend-scroll::-webkit-scrollbar-thumb {
//           background: #888;
//           border-radius: 3px;
//         }
//         .legend-scroll::-webkit-scrollbar-thumb:hover {
//           background: #555;
//         }
//         .status-text:hover {
//           color: #1a252f;
//         }
//         .default-badge {
//           transition: all 0.2s ease;
//         }
//         .default-badge:hover {
//           opacity: 1;
//         }
//       `}</style>
//     </Card>
//   );
// };

// export default Legend;