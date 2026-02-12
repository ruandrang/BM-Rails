class AddRegularQuartersToMatches < ActiveRecord::Migration[8.1]
  def change
    add_column :matches, :regular_quarters, :integer, null: false, default: 4
  end
end
