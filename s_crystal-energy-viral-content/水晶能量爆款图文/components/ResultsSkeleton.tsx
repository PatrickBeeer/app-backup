
import React from 'react';

export const ResultsSkeleton: React.FC = () => {
    return (
        <div className="p-6 md:p-8 animate-pulse w-full">
            <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-lg mb-6"></div>
            <div className="space-y-5">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </div>
            </div>
        </div>
    );
};
