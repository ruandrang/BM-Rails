class Admin::MembersController < Admin::BaseController
  def index
    @members = paginate(Member.includes(:club).order(:id))
  end

  def show
    @member = Member.includes(:club, :teams).find(params[:id])
  end
end
