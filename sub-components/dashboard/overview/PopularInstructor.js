// import node module libraries
import React, { useState } from 'react';
import Link from 'next/link';
import { Col, Row, Card, ListGroup, Dropdown, Image, Modal, Button } from 'react-bootstrap';

// import utility file
import { numberWithCommas } from 'helper/utils';

// import data files
import InstructorData from 'data/users/InstructorData';

const PopularInstructor = ({ title }) => {
	const [show, setShow] = useState(false);

	const handleClose = () => setShow(false);
	const handleShow = () => setShow(true);

	const CustomToggle = React.forwardRef(({ children, onClick }, ref) => (
		(<Link
			href=""
			ref={ref}
			onClick={(e) => {
				e.preventDefault();
				onClick(e);
			}}
			className="btn-icon btn btn-ghost btn-sm rounded-circle">
			{children}
		</Link>)
	));
	CustomToggle.displayName = 'CustomToggle';

	const ActionMenu = () => {
		return (
			<div>
				<Dropdown>
					<Dropdown.Toggle as={CustomToggle}>
						<i className="fe fe-more-vertical text-muted"></i>
					</Dropdown.Toggle>
					<Dropdown.Menu align="end">
						<Dropdown.Header>SETTINGS</Dropdown.Header>
						<Dropdown.Item onClick={handleShow}>
							<i className="fe fe-edit dropdown-item-icon"></i> View
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown>
			</div>
		);
	};

	return (
		<>
			<Card className="h-100">
				<Card.Header className="d-flex align-items-center justify-content-between card-header-height">
					{/* <h4 className="mb-0">{title}</h4> */}
					<h4 className="mb-0">Worker Schedule</h4>
					<Link href="/dashboard/workers/worker" className="btn btn-outline-secondary btn-sm">
						View all
					</Link>
				</Card.Header>
				<Card.Body>
					<ListGroup variant="flush">
						{InstructorData.slice(0, 5).map((item, index) => (
							<ListGroup.Item
								className={`px-0 ${index === 0 ? 'pt-0' : ''}`}
								key={index}
							>
								<Row>
									<Col xs="auto">
										<div
											className={`avatar avatar-md avatar-indicators avatar-${item.status}`}
										>
											<Image
												alt="avatar"
												src={item.image}
												className="rounded-circle"
											/>
										</div>
									</Col>
									<Col className="ms-n3">
										<h4 className="mb-0 h5">{item.name}</h4>
										<span className="me-2 fs-6">
											<span className="text-dark  me-1 fw-semi-bold">
												{item.courses}
											</span>
											Schedule
										</span>
										
										<span className="fs-6">
											{' '}
											<span className="text-dark  me-1 fw-semi-bold">
												06-13-2024
											</span>{' '}
											Date
										</span>
									</Col>
									<Col xs="auto">
										<ActionMenu />
									</Col>
								</Row>
							</ListGroup.Item>
						))}
					</ListGroup>
				</Card.Body>
			</Card>

			<Modal show={show} onHide={handleClose}>
				<Modal.Header closeButton>
					<Modal.Title>Worker Schedule</Modal.Title>
				</Modal.Header>
				<Modal.Body>
				<div>
							<p><strong>Worker Name:</strong> Jenny Wilson</p>
							<p><strong>Date Today:</strong>06-13-2024</p>
							<p><strong>Date Scheduled Assign:</strong> 06-15-2024</p>
							<p><strong>Status:</strong> Absent</p>
						</div>
				</Modal.Body>
				<Modal.Footer>
					<Button variant="secondary" onClick={handleClose}>
						Close
					</Button>
				</Modal.Footer>
			</Modal>
		</>
	);
};

export default PopularInstructor;
