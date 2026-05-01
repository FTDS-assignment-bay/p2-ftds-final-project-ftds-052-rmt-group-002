import { RevenueKpiCards } from "./_components/revenue-kpi-cards";
import { RevenueTrendChart } from "./_components/revenue-trend-chart";
import { RevenueCategoriesGender } from "./_components/revenue-categories-gender";
import { CustomerDistributionMap } from "./_components/revenue-distribution-map";
import { AgeRevenueCard } from "./_components/revenue-by-age";


export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <RevenueKpiCards />
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">
        <RevenueTrendChart />
        <RevenueCategoriesGender />
      </div>
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">
        {/* ── Revenue distribution by cities ── */}
        <CustomerDistributionMap />
        {/* ── Revenue distribution by age categories ── */}
        <AgeRevenueCard />
      </div>
    </div >
  );
}