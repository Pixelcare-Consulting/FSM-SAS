import React, { useState } from 'react';
import { Col, Row, Card, ListGroup, Image, Button } from 'react-bootstrap';
import { ArrowLeft, ArrowRight } from 'react-bootstrap-icons'; // Assuming you have these icons imported

import ActivityData from 'data/users/ActivityData'; // Assuming this path is correct

const Activity = ({ title }) => {
	const [currentPage, setCurrentPage] = useState(1);
	const itemsPerPage = 6;
	const indexOfLastItem = currentPage * itemsPerPage;
	const indexOfFirstItem = indexOfLastItem - itemsPerPage;
	const currentItems = ActivityData.slice(indexOfFirstItem, indexOfLastItem);

	const handleNextPage = () => {
		setCurrentPage((prevPage) => prevPage + 1);
	};

	const handlePrevPage = () => {
		setCurrentPage((prevPage) => prevPage - 1);
	};

	return (
		<Card className="h-100">
			<Card.Header className="d-flex align-items-center justify-content-between card-header-height">
				<h4 className="mb-0">{title}</h4>
			</Card.Header>
			<Card.Body>
				<Row>
					{currentItems.map((item, index) => (
						<Col md={6} key={index}>
							<ListGroup.Item className="px-0 pt-0 border-0 mb-2">
								<Row className="align-items-center">
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
									<Col className="ms-n2">
										<h4 className="mb-0 h5">{item.name}</h4>
										<p className="mb-1">{item.jobTitle}</p>
										<p className="mb-1">{item.serviceLocation}</p>
										<span className="fs-6">{item.postedon}</span>
									</Col>
								</Row>
							</ListGroup.Item>
						</Col>
					))}
				</Row>
				<div className="d-flex justify-content-between mt-4">
					<Button variant="primary" disabled={currentPage === 1} onClick={handlePrevPage}>
						<ArrowLeft />
					</Button>
					<Button variant="primary" disabled={currentItems.length < itemsPerPage} onClick={handleNextPage}>
						<ArrowRight />
					</Button>
				</div>
			</Card.Body>
		</Card>
	);
};

export default Activity;
