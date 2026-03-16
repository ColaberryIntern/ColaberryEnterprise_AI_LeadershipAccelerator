import React from 'react';
import { DemoDepartment } from './demoData';
import DepartmentNode from './DepartmentNode';

interface DepartmentMapDemoProps {
  departments: DemoDepartment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DepartmentMapDemo({
  departments,
  selectedId,
  onSelect,
}: DepartmentMapDemoProps) {
  return (
    <div className="row g-2">
      {departments.map((dept) => (
        <div className="col-6" key={dept.id}>
          <DepartmentNode
            department={dept}
            isSelected={selectedId === dept.id}
            onClick={() => onSelect(dept.id)}
          />
        </div>
      ))}
    </div>
  );
}
