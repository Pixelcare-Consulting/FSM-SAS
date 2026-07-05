// import widget/custom components from home folder 
import FeaturesList from 'widgets/home/FeaturesList';
import HeroHeader from 'widgets/home/HeroHeader';

// import widget/custom components from courses folder 
import CourseCard from 'widgets/courses/CourseCard';
import CourseSlider from 'widgets/courses/CourseSlider';

// import widget/custom components from page-headings folder 
import PageHeadingBriefinfo from 'widgets/page-headings/PageHeadingBriefinfo';
import PageHeading from 'widgets/page-headings/PageHeading';
import PageHeadingDescription from 'widgets/page-headings/PageHeadingDescription';

// import widget/custom components from section-headings folder 
import SectionHeadingLeft from 'widgets/section-headings/SectionHeadingLeft';
import SectionHeadingLeft2 from 'widgets/section-headings/SectionHeadingLeft2';
import SectionHeadingLeft3 from 'widgets/section-headings/SectionHeadingLeft3';
import SectionHeadingLeftBold from 'widgets/section-headings/SectionHeadingLeftBold';
import SectionHeadingCenter from 'widgets/section-headings/SectionHeadingCenter';
import SectionHeadingDarkCenter from 'widgets/section-headings/SectionHeadingDarkCenter';

// import widget/custom components from stats folder 
import StatTopLine from 'widgets/stats/StatTopLine';
import StatRightBadge from 'widgets/stats/StatRightBadge';
import StatTopIcon from 'widgets/stats/StatTopIcon';
import StatRightIcon from 'widgets/stats/StatRightIcon';
import StatCenterInfo from 'widgets/stats/StatCenterInfo';
import StatRightBGIcon from 'widgets/stats/StatRightBGIcon';
import StatRightCenterIcon from 'widgets/stats/StatRightCenterIcon';
import StatRightChart from 'widgets/stats/StatRightChart';
import StatTopSVGIcon from 'widgets/stats/StatTopSVGIcon';  // added in v2.0.0
import StatTopBigIcon from 'widgets/stats/StatTopBigIcon';  // added in v2.0.0

// import widget/custom components from accordions folder 
import GKAccordionPlus from 'widgets/accordions/GKAccordionPlus';
import GKAccordionProgress from 'widgets/accordions/GKAccordionProgress';
import GKAccordionDefault from 'widgets/accordions/GKAccordionDefault';
import GKAccordionActions from 'widgets/accordions/GKAccordionActions';
import GKAccordionBox from 'widgets/accordions/GKAccordionBox';

// import widget/custom components from testimonials folder 
import TestimonialsSlider from 'widgets/testimonials/TestimonialsSlider';
import TestimonialColorCard from 'widgets/testimonials/TestimonialColorCard';
import TestimonialsSlider2 from 'widgets/testimonials/TestimonialsSlider2';
import TestimonialsSlider3 from 'widgets/testimonials/TestimonialsSlider3'; // added in v2.0.0

// import widget/custom components from features folder 
import FeatureTopIcon from 'widgets/features/FeatureTopIcon';
import FeatureTopIconCard from 'widgets/features/FeatureTopIconCard';
import FeatureTopIcon2 from 'widgets/features/FeatureTopIcon2';
import FeatureTopIcon3 from 'widgets/features/FeatureTopIcon3';
import FeatureLeftIcon from 'widgets/features/FeatureLeftIcon';
import FeatureBulletList from 'widgets/features/FeatureBulletList';
import FeatureTopIconWithLink from 'widgets/features/FeatureTopIconWithLink';

// import widget/custom components from ratings folder 
import Ratings from 'widgets/ratings/Ratings';
import RatingsBiIcon from 'widgets/ratings/RatingsBiIcon'; // ( added in v2.2.0 )

// import widget/custom componetns from card folder ( added in v2.0.0)
import InstructorReviewCard from 'widgets/cards/InstructorReviewCard'; // moved from ratings to card folder in v2.0.0
import CompanyListingCard from 'widgets/cards/CompanyListingCard';
import FeaturedCompaniesCard from 'widgets/cards/FeaturedCompaniesCard';
import GetEnrolledCourseCard from 'widgets/cards/GetEnrolledCourseCard';
import JobListingGridviewCard from 'widgets/cards/JobListingGridviewCard';
import JobListingListviewCard from 'widgets/cards/JobListingListviewCard';
import SkillCourseCard from 'widgets/cards/SkillCourseCard'; // added in (v2.2.0)
import WebinarCard from 'widgets/cards/WebinarCard'; // added in (v2.2.0)
import MentorCard from 'widgets/cards/MentorCard'; // added in (v2.3.0)
import MentorSummaryCard from 'widgets/cards/MentorSummaryCard'; // added in (v2.3.0)

// import widget/custom components from clientlogos folder 
import LogosTopHeading from 'widgets/clientlogos/LogosTopHeading';
import LogosTopHeading2 from 'widgets/clientlogos/LogosTopHeading2';
import LogosTopHeading3 from 'widgets/clientlogos/LogosTopHeading3'; // added in v2.2.0
import LogosTopHeadingOffset from 'widgets/clientlogos/LogosTopHeadingOffset';
import LogosTopHeadingInverseDark from 'widgets/clientlogos/LogosTopHeadingInverseDark';
import LogosTopHeadingOffset2 from 'widgets/clientlogos/LogosTopHeadingOffset2';  // added in v2.0.0
import LogosTopBrands from 'widgets/clientlogos/LogosTopBrands' // added in v2.3.0

// import widget/custom components from call-to-action folder 
import CTAButton from 'widgets/call-to-action/CTAButton';
import CTADarkBG from 'widgets/call-to-action/CTADarkBG';
import CTALightBG from 'widgets/call-to-action/CTALightBG'; // added in v2.0.0
import CTA2Buttons from 'widgets/call-to-action/CTA2Buttons'; // added in v2.0.0

// import widget/custom components from form-select folder 
import { FormSelect } from 'widgets/form-select/FormSelect';

// import widget/custom components from form-select folder 
import ReactQuillEditor from 'widgets/editor/ReactQuillEditor';

// import widget/custom components from miscellaneous folder 
import LevelIcon from 'widgets/miscellaneous/LevelIcon';
import LevelIconWithTooltip from 'widgets/miscellaneous/LevelIcon';
import GridListViewButton from 'widgets/miscellaneous/GridListViewButton';

// import widget/custom components from video folder 
import GKYouTube from 'widgets/video/GKYouTube';

// import widget/custom components from tags folder 
import GKTagsInput from 'widgets/tags/GKTagsInput';
import GKTagsEmailInput from 'widgets/tags/GKTagsEmailInput';

// import widget/custom components from lightbox folder 
import GKLightbox from 'widgets/lightbox/GKLightbox';

// import widget/custom components from charts folder 
// ApexCharts is imported normally - error handling is in the component itself
import ApexCharts from 'widgets/charts/ApexCharts';
import ProgressChart from 'widgets/charts/ProgressChart';

// import widget/custom components from headers folder 
import ProfileCover from 'widgets/headers/ProfileCover';
import ProfileCoverFull from 'widgets/headers/ProfileCoverFull';

// import widget/custom components from advance-table folder 
import GlobalFilter from 'widgets/advance-table/GlobalFilter';
import Pagination from 'widgets/advance-table/Pagination';
import Checkbox from 'widgets/advance-table/Checkbox';
import TanstackTable from 'widgets/advance-table/TanstackTable'; // added in v2.2.0

// import widget/custom components from flat-pickr folder 
import { FlatPickr } from 'widgets/flat-pickr/FlatPickr';

// import widget/custom components from passwordstrength folder 
import PasswordStrengthMeter from 'widgets/passwordstrength/PasswordStrengthMeter';

// import widget/custom components from account-settings folder 
import ACEditProfilePage from 'widgets/account-settings/EditProfile'; //  Account Settings Edit Profile Page 
import ACSecuirtyPage from 'widgets/account-settings/Security'; //  Account Settings Security Page 
import ACSocialProfilesPage from 'widgets/account-settings/SocialProfiles'; //  Account Settings Social Profiles Page
import ACNotificationsPage from 'widgets/account-settings/Notifications'; //  Account Settings Notifications Page 
import ACProfilePrivacyPage from 'widgets/account-settings/ProfilePrivacy'; //  Account Settings Profile Privacy Page 
import ACDeleteProfilePage from 'widgets/account-settings/DeleteProfile'; //  Account Settings Delete ProfilePage 

// import widget/custom components from seo folder 
import GeeksSEO from 'widgets/seo/GeeksSEO';

// import widget/custom components from map folder
import UsersbyCountry from 'widgets/maps/UsersbyCountry';

// import widget/custom components from dropfiles folder 
import { DropFiles } from 'widgets/dropfiles/DropFiles';

// import widget/custom components from highlight-code folder 
import HighlightCode from 'widgets/highlight-code/HighlightCode';

// import widget/custom components from tooltips folder 
import GKTippy from 'widgets/tooltips/GKTippy';

// import widget/custom components from range-slider folder 
import RangeSlider from 'widgets/range-slider/RangeSlider';

// import table widget/custom components  ( added in v2.2.0 )
import TableBasic from 'widgets/tables/TableBasic';
import TableDark from 'widgets/tables/TableDark';
import TableHeadOptions from 'widgets/tables/TableHeadOptions';
import TableStriped from 'widgets/tables/TableStriped';
import TableBordered from 'widgets/tables/TableBordered';
import TableBorderedColor from 'widgets/tables/TableBorderedColor';
import TableBorderless from 'widgets/tables/TableBorderless';
import TableHover from 'widgets/tables/TableHover';
import TableNesting from 'widgets/tables/TableNesting';
import TableActive from 'widgets/tables/TableActive';
import TableSmall from 'widgets/tables/TableSmall';

// import modal popups ( add in v2.3.0)
import SignUpModalPopup from 'widgets/modal-popup/SignUpModalPopup';

export {
   ACDeleteProfilePage,
   ACEditProfilePage,
   ACNotificationsPage,
   ACProfilePrivacyPage,
   ACSecuirtyPage,
   ACSocialProfilesPage,
   ApexCharts,
   Checkbox,
   CourseCard,
   CourseSlider,
   CTAButton,
   CTADarkBG,
   CTALightBG,
   CTA2Buttons,
   DropFiles,
   FeatureBulletList,
   FeatureLeftIcon,
   FeaturesList,
   FeatureTopIcon,
   FeatureTopIcon2,
   FeatureTopIcon3,
   FeatureTopIconCard,
   FeatureTopIconWithLink,
   FlatPickr,
   FormSelect,
   GeeksSEO,
   GKAccordionActions,
   GKAccordionBox,
   GKAccordionDefault,
   GKAccordionPlus,
   GKAccordionProgress,
   GKTagsEmailInput,
   GKTagsInput,
   GKTippy,
   GKYouTube,
   GlobalFilter,
   GridListViewButton,
   HeroHeader,
   HighlightCode,
   InstructorReviewCard,
   LevelIcon,
   LevelIconWithTooltip,
   LogosTopBrands,
   LogosTopHeading,
   LogosTopHeading2,
   LogosTopHeading3,
   LogosTopHeadingInverseDark,
   LogosTopHeadingOffset,
   LogosTopHeadingOffset2,
   PageHeading,
   PageHeadingBriefinfo,
   PageHeadingDescription,
   Pagination,
   PasswordStrengthMeter,
   ProfileCover,
   ProfileCoverFull,
   ProgressChart,
   Ratings,
   RatingsBiIcon,
   ReactQuillEditor,
   SectionHeadingCenter,
   SectionHeadingDarkCenter,
   SectionHeadingLeft,
   SectionHeadingLeft2,
   SectionHeadingLeft3,
   SectionHeadingLeftBold,
   StatCenterInfo,
   StatRightBadge,
   StatRightBGIcon,
   StatRightCenterIcon,
   StatRightChart,
   StatRightIcon,
   StatTopBigIcon,
   StatTopIcon,
   StatTopSVGIcon,
   StatTopLine,
   TestimonialColorCard,
   TestimonialsSlider,
   TestimonialsSlider2,
   TestimonialsSlider3,
   UsersbyCountry,

   CompanyListingCard, FeaturedCompaniesCard, GetEnrolledCourseCard,
   JobListingGridviewCard, JobListingListviewCard,
   SkillCourseCard, WebinarCard, MentorCard, MentorSummaryCard,
   GKLightbox,
   RangeSlider,

   TableBasic,
   TableDark,
   TableHeadOptions,
   TableStriped,
   TableBordered,
   TableBorderedColor,
   TableBorderless,
   TableHover,
   TableNesting,
   TableActive,
   TableSmall,
   TanstackTable,

   SignUpModalPopup

};
