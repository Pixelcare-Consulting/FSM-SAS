// import node module libraries
import React, { Fragment, useState } from "react";
import Nouislider from "nouislider-react";
import PropTypes from 'prop-types';

const RangeSlider = (props) => {
    const {
        startValue = 20,
        rangeMin = 0,
        rangeMax = 100,
    } = props;
    const [value, setValue] = useState(startValue)

    const handleOnSlide = (render, handle, value, un, percent) => {
        // Slider handle code goes here...    
    };
    return (
        <Fragment>
            <Nouislider
                range={{ min: rangeMin, max: rangeMax }}
                start={value}
                step={1}
                connect
                tooltips={{
                    to: function (value) { return value.toFixed(0) }
                }}
                onSlide={handleOnSlide}
            />
        </Fragment>
    )
}

// ** PropTypes
RangeSlider.propTypes = {
    startValue: PropTypes.number,
    endValue: PropTypes.number,
    rangeMin: PropTypes.number,
    rangeMax: PropTypes.number
};

export default RangeSlider;