class Admin::BaseController < ApplicationController
  before_action :require_admin

  PER_PAGE = 20

  private

  def paginate(scope)
    page = (params[:page] || 1).to_i
    page = 1 if page < 1
    offset = (page - 1) * PER_PAGE
    total = scope.count
    total_pages = (total.to_f / PER_PAGE).ceil

    @pagination = {
      current_page: page,
      total_pages: total_pages,
      total_count: total,
      per_page: PER_PAGE
    }

    scope.offset(offset).limit(PER_PAGE)
  end
end
