class CreateFeedbacks < ActiveRecord::Migration[8.1]
  def change
    create_table :feedbacks do |t|
      t.text :content, null: false
      t.string :category, default: "general", null: false
      t.references :user, null: false, foreign_key: true

      t.timestamps
    end
  end
end
