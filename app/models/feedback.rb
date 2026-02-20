class Feedback < ApplicationRecord
  CATEGORIES = %w[general bug feature].freeze

  belongs_to :user

  validates :content, presence: true, length: { maximum: 2000 }
  validates :category, presence: true, inclusion: { in: CATEGORIES }
end
