import React, { useState, useCallback } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GripVertical } from 'lucide-react';

interface BarItem {
  name: string;
  fullName: string;
  value: number;
  total: number;
  productivity: number;
  color: string;
}

interface DraggableBarProps {
  item: BarItem;
  index: number;
  maxValue: number;
  moveBar: (dragIndex: number, hoverIndex: number) => void;
}

const ItemTypes = {
  BAR: 'bar',
};

const DraggableBar: React.FC<DraggableBarProps> = ({ item, index, maxValue, moveBar }) => {
  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.BAR,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: ItemTypes.BAR,
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveBar(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

  return (
    <div
      ref={(node) => preview(drop(node))}
      className={`flex items-center gap-2 py-2 px-1 rounded-lg transition-all cursor-move ${
        isDragging ? 'opacity-50 bg-accent/20' : ''
      } ${isOver ? 'bg-accent/10' : ''}`}
      style={{ 
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.15s ease, opacity 0.15s ease'
      }}
    >
      <div
        ref={drag}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-accent/20 transition-colors"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span 
            className="text-xs font-medium truncate" 
            style={{ color: 'hsl(0 0% 0%)',fontWeight:'bold'}}
            title={item.fullName}
          >
            {item.fullName}
            <span className="text-muted-foreground ml-1">
              ({item.value}/{item.total})
            </span>
          </span>
          <span 
            className="text-xs font-bold ml-2 flex-shrink-0"
            style={{ 
              color: item.productivity >= 80 ? '#43e97b' : item.productivity < 40 ? '#ef4444' : '#ffc107'
            }}
          >
            {item.productivity.toFixed(1)}%
          </span>
        </div>

        <div className="relative h-5 bg-card/50 rounded overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 rounded transition-all duration-300"
            style={{ 
              width: `${barWidth}%`,
              backgroundColor: item.color,
              minWidth: '4px'
            }}
          />
          
        </div>
      </div>
    </div>
  );
};

interface DraggableBarChartProps {
  data: BarItem[];
  onReorder?: (newData: BarItem[]) => void;
}

const DraggableBarChartInner: React.FC<DraggableBarChartProps> = ({ data, onReorder }) => {
  const [items, setItems] = useState<BarItem[]>(data);

  // Update items when data prop changes
  React.useEffect(() => {
    setItems(data);
  }, [data]);

  const moveBar = useCallback((dragIndex: number, hoverIndex: number) => {
    setItems((prevItems) => {
      const newItems = [...prevItems];
      const [removed] = newItems.splice(dragIndex, 1);
      newItems.splice(hoverIndex, 0, removed);
      onReorder?.(newItems);
      return newItems;
    });
  }, [onReorder]);

  const maxValue = Math.max(...items.map(item => item.value), 1);

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4 text-sm">
        Nenhum dado para exibir
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <DraggableBar
          key={`${item.fullName}-${index}`}
          item={item}
          index={index}
          maxValue={maxValue}
          moveBar={moveBar}
        />
      ))}
    </div>
  );
};

export const DraggableBarChart: React.FC<DraggableBarChartProps> = (props) => {
  return (
    <DndProvider backend={HTML5Backend}>
      <DraggableBarChartInner {...props} />
    </DndProvider>
  );
};