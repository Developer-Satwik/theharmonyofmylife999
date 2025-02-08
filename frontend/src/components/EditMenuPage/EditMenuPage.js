import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'; // Drag-and-drop functionality
import { FiMove, FiPlus, FiSave, FiTrash2, FiEdit3 } from 'react-icons/fi';
import './EdiMenuPage.css'; // Ensure the CSS file is imported

axios.defaults.baseURL = process.env.REACT_APP_BACKEND_URL;

const EditMenuPage = () => {
  const { restaurantId } = useParams();
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // State for search query
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // Ref to focus on the new item's input box
  const newItemInputRef = useRef(null);

  // Categories for the dropdown
  const categories = ['Beverages', 'Desserts', 'Main Course', 'Appetizers', 'Snacks'];

  // Fetch menu data from the backend
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const token = localStorage.getItem('userToken');
        if (!token) {
          setError('Please log in to edit the menu');
          return;
        }

        const response = await axios.get(`/api/restaurants/${restaurantId}/menu`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Convert sizes from Map to object for consistency with RestaurantMenu.js
        const menuWithSizesAsObjects = response.data.menu.map((item) => ({
          ...item,
          sizes: item.sizes instanceof Map ? Object.fromEntries(item.sizes) : item.sizes,
        }));
        setMenu(menuWithSizesAsObjects || []);
      } catch (err) {
        console.error('Failed to fetch menu:', err);
        setError(err.response?.data?.message || 'Failed to fetch menu. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
  }, [restaurantId]);

  // Add a new menu item
  const handleAddItem = () => {
    const newItem = {
      itemName: '',
      description: '',
      imageUrl: '',
      category: '',
      sizes: {},
      isNew: true,
    };
    setMenu([...menu, newItem]);

    setTimeout(() => {
      if (newItemInputRef.current) {
        newItemInputRef.current.focus();
        newItemInputRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Remove a menu item
  const handleRemoveItem = (index) => {
    const isConfirmed = window.confirm('Are you sure you want to remove this item?');
    if (isConfirmed) {
      const newMenu = menu.filter((_, i) => i !== index);
      setMenu(newMenu);
    }
  };

  // Handle changes to input fields
  const handleChange = (index, field, value) => {
    const newMenu = [...menu];
    newMenu[index] = { ...newMenu[index], [field]: value };
    setMenu(newMenu);
  };

  // Handle changes to size and price
  const handleSizePriceChange = (index, oldSize, newSize, newPrice) => {
    if (isNaN(newPrice)) {
      alert('Price must be a number.');
      return;
    }
    const newMenu = [...menu];
    const sizes = { ...newMenu[index].sizes }; // Use object for sizes

    // If the size name is being changed, delete the old size and add the new one
    if (oldSize !== newSize) {
      delete sizes[oldSize]; // Remove the old size
    }
    sizes[newSize] = parseFloat(newPrice); // Add/update the new size and price

    newMenu[index].sizes = sizes; // Set the updated object back
    setMenu(newMenu);
  };

  // Add a new size and price
  const handleAddSize = (index, size, price) => {
    if (!size || !price) {
      alert('Please enter both size and price.');
      return;
    }
    if (isNaN(price)) {
      alert('Price must be a number.');
      return;
    }
    const newMenu = [...menu];
    const sizes = { ...newMenu[index].sizes }; // Use object for sizes

    if (sizes[size]) {
      alert('This size already exists.');
      return;
    }

    sizes[size] = parseFloat(price); // Add the new size and price
    newMenu[index].sizes = sizes; // Set the updated object back
    setMenu(newMenu);
  };

  // Remove a size and price
  const handleRemoveSize = (index, size) => {
    const isConfirmed = window.confirm('Are you sure you want to remove this size?');
    if (isConfirmed) {
      const newMenu = [...menu];
      const sizes = { ...newMenu[index].sizes }; // Use object for sizes
      delete sizes[size]; // Remove the size
      newMenu[index].sizes = sizes; // Set the updated object back
      setMenu(newMenu);
    }
  };

  // Update a specific menu item
  const handleUpdateItem = async (index) => {
    try {
      const token = localStorage.getItem('userToken');
      const itemToUpdate = menu[index];
      await axios.put(`/api/restaurants/${restaurantId}/menu/${index}`, itemToUpdate, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Item updated successfully!');
    } catch (err) {
      console.error('Failed to update item:', err);
      alert('Failed to update item. Please try again.');
    }
  };

  // Save the entire menu
  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('userToken');
      if (!token) {
        alert('Please log in to save changes');
        return;
      }

      // Validate menu items
      const invalidItems = menu.filter(item => 
        !item.itemName || !item.category || Object.keys(item.sizes).length === 0
      );

      if (invalidItems.length > 0) {
        alert('Please fill in all required fields (name, category, and at least one size) for all items.');
        return;
      }

      await axios.put(
        `/api/restaurants/${restaurantId}/menu`,
        { menu },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Menu updated successfully!');
      navigate('/restaurant-panel');
    } catch (err) {
      console.error('Failed to update menu:', err);
      alert(err.response?.data?.message || 'Failed to update menu. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Drag-and-drop functionality
  const onDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(menu);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setMenu(items);
  };

  // Filter menu items based on search query
  const filteredMenu = menu.filter((item) =>
    item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="edit-menu-page">
        <div className="loading">Loading menu...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="edit-menu-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="edit-menu-page">
      <div className="edit-menu-header">
        <h1>Edit Menu</h1>
        <button className="add-item-button" onClick={handleAddItem}>
          <FiPlus /> Add New Item
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search menu items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="menu-items">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="menu-items-container"
            >
              {filteredMenu.map((item, index) => (
                <Draggable key={index} draggableId={`item-${index}`} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`menu-item ${snapshot.isDragging ? 'dragging' : ''}`}
                    >
                      <div {...provided.dragHandleProps} className="drag-handle">
                        <FiMove />
                      </div>

                      <input
                        type="text"
                        value={item.itemName}
                        onChange={(e) => handleChange(index, 'itemName', e.target.value)}
                        placeholder="Item Name"
                        ref={index === menu.length - 1 ? newItemInputRef : null}
                        required
                      />

                      <textarea
                        value={item.description}
                        onChange={(e) => handleChange(index, 'description', e.target.value)}
                        placeholder="Description"
                        rows={3}
                      />

                      <input
                        type="text"
                        value={item.imageUrl}
                        onChange={(e) => handleChange(index, 'imageUrl', e.target.value)}
                        placeholder="Image URL"
                      />

                      {item.imageUrl && (
                        <div className="image-preview">
                          <img src={item.imageUrl} alt={item.itemName} />
                        </div>
                      )}

                      <select
                        value={item.category}
                        onChange={(e) => handleChange(index, 'category', e.target.value)}
                        required
                      >
                        <option value="">Select Category</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>

                      <div className="sizes-section">
                        <h4>Sizes and Prices</h4>
                        <table className="sizes-table">
                          <thead>
                            <tr>
                              <th>Size</th>
                              <th>Price</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(item.sizes).map(([size, price]) => (
                              <tr key={size}>
                                <td>
                                  <input
                                    type="text"
                                    value={size}
                                    onChange={(e) =>
                                      handleSizePriceChange(index, size, e.target.value, price)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    value={price}
                                    onChange={(e) =>
                                      handleSizePriceChange(index, size, size, e.target.value)
                                    }
                                    step="0.01"
                                  />
                                </td>
                                <td>
                                  <button
                                    onClick={() => handleRemoveSize(index, size)}
                                    className="remove-button"
                                  >
                                    <FiTrash2 />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="add-size">
                          <input
                            type="text"
                            placeholder="Size (e.g., Small)"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                const price = e.target.nextElementSibling.value;
                                handleAddSize(index, e.target.value, price);
                                e.target.value = '';
                                e.target.nextElementSibling.value = '';
                              }
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            step="0.01"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                const size = e.target.previousElementSibling.value;
                                handleAddSize(index, size, e.target.value);
                                e.target.value = '';
                                e.target.previousElementSibling.value = '';
                              }
                            }}
                          />
                          <button
                            onClick={(e) => {
                              const size = e.target.previousElementSibling.previousElementSibling.value;
                              const price = e.target.previousElementSibling.value;
                              if (size && price) {
                                handleAddSize(index, size, price);
                                e.target.previousElementSibling.previousElementSibling.value = '';
                                e.target.previousElementSibling.value = '';
                              }
                            }}
                          >
                            <FiPlus />
                          </button>
                        </div>
                      </div>

                      <div className="action-buttons">
                        <button
                          className="update-button"
                          onClick={() => handleUpdateItem(index)}
                        >
                          <FiEdit3 /> Update Item
                        </button>
                        <button
                          className="remove-button"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <FiTrash2 /> Remove Item
                        </button>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button
        className="save-menu-button"
        onClick={handleSave}
        disabled={saving}
      >
        <FiSave /> {saving ? 'Saving...' : 'Save Menu'}
      </button>
    </div>
  );
};

export default EditMenuPage;